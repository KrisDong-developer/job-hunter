/**
 * 猎聘的**动作实现** —— `readInbox`（接口，只读）/ `sayHello` / `reply`（页面输入面 + CDP 真键盘）。
 *
 * ## 发送链路为什么这样做（2026-09-20 发送实验定案）
 *
 * 猎聘**不替你发消息**（`open-chat` 受理后只插入一条"打招呼语建议"系统卡片），
 * 真正的话术必须打进 IM 输入面（`textarea.im-ui-textarea`，placeholder「按Enter键发送」），
 * 发送走私有 WS —— 所以与 zhipin 的 `#chat-input` 同一条路：**逐字符输入 → 回车 → 回读我方消息节点**。
 *
 * 三个猎聘特有的事实，全部写进了流程（2026-09-20 发送实验两次实测定案）：
 *   * **输入前必须校验上屏**：第一次实验里点击落在动画中的弹窗上、焦点没进输入框，
 *     `insertText` 全部落空（`textarea.value` 恒空、Enter 落空、什么都没发出）；
 *     第二次焦点落定后 `insertText` 即正常上屏、回车送达（DOM 回读 + 接口交叉验证双确认）。
 *     ⇒ 输入必须**先校验 value 再回车**，聚焦失败时再点一次并回退真键盘路径；
 *   * **拒绝路径的 DOM 证据是 `.complete-resume-modal`**（`open-chat` code 30011 时弹出；
 *     HTTP 是 200，`PageLike` 看不到那条应答，只能靠它分辨"受理/被拒"）；
 *   * **受理的证据是输入框出现**（会话以 chat modal 形式在当前页打开）。
 *
 * 完整实测记录见 `./index.ts` 文件头与 `docs/ADAPTERS.md` §7.2 猎聘条。
 */
import { humanDelayMs } from '../../pacing.js';
import { dwellBeforeActMs, humanClick, humanHover, humanPress, humanType } from '../../humanize.js';
import { PlatformBlockedError } from '../../types.js';
import { blockFromApiFailure } from '../../block-signals.js';
import { contactRowsOf, fetchContactListInPage, inboxMessageOf } from './api.js';
import { buildContactListBody, buildLiepinSearchUrl } from './urls.js';
import { composerValueInPage, elementCenterInPage, hasSelectorInPage, readChatMessagesInPage, } from './page/chat.js';
export function createLiepinActions(ctx) {
    const config = ctx.config;
    const [delayMin, delayMax] = ctx.delayRangeMs;
    /**
     * 等元素出现。
     *
     * 两条路径的**失败形态不同**，必须都归一成布尔（与 zhipin 的 `waitFor` 同款）：
     * 真页面 = Playwright `waitForSelector`（超时**抛错**）；离线夹具 = 返回 `true/false`。
     */
    const waitFor = async (page, selector, timeoutMs) => {
        if (page.waitForSelector !== undefined) {
            try {
                const ready = await page.waitForSelector(selector, timeoutMs);
                return ready !== false;
            }
            catch {
                return false;
            }
        }
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            if (await page.evaluate(hasSelectorInPage, { selector }))
                return true;
            if (Date.now() >= deadline)
                return false;
            await page.waitForTimeout(150);
        }
    };
    /** 定位一个可见元素（不点击）。`excludeAncestor` 用来跳过侧边栏的同类入口。 */
    const locate = async (page, selector, textIncludes, excludeAncestor) => await page.evaluate(elementCenterInPage, textIncludes === undefined && excludeAncestor === undefined
        ? { selector }
        : {
            selector,
            ...(textIncludes === undefined ? {} : { textIncludes }),
            ...(excludeAncestor === undefined || excludeAncestor === '' ? {} : { excludeAncestor }),
        });
    /** 拟人点击一个选择器；返回定位信息（失败返回 null）。没有 CDP 鼠标 → 直接 null。 */
    const clickSelector = async (page, selector, textIncludes, excludeAncestor) => {
        const mouse = page.mouse;
        if (mouse === undefined)
            return null;
        const info = await locate(page, selector, textIncludes, excludeAncestor);
        if (!info.found)
            return null;
        const wait = (ms) => page.waitForTimeout(ms);
        // 先悬停再点击：悬停是必须的（猎聘有的入口 hover 才亮），"到位后停一下"也是最稳定的真人特征。
        await humanHover(mouse, info.x, info.y, { wait });
        await humanClick(mouse, info.x, info.y, { wait });
        return info;
    };
    /** 动手前的停留（数值口径走 `humanize.dwellBeforeActMs`，与 zhipin 同一份实现）。`[0,0]` = 关闭。 */
    const dwell = async (page, range) => {
        const [min, max] = range;
        if (max <= 0)
            return;
        await page.waitForTimeout(dwellBeforeActMs({ minMs: min, maxMs: max }));
    };
    /** 回车发送（placeholder 明写「按Enter键发送」；`humanPress` 在按下前后各留停顿）。 */
    const pressSend = async (page) => {
        const keyboard = page.keyboard;
        if (keyboard === undefined)
            return;
        await humanPress(keyboard, 'Enter', { wait: (ms) => page.waitForTimeout(ms) });
    };
    const missingInputSurface = () => ({
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message: '当前页面没有提供 CDP 输入能力（page.mouse / page.keyboard）—— 拒绝用 DOM 事件冒充真人点击' +
            '（isTrusted=false 是最廉价的自动化特征）。这条动作按未发送处理。',
    });
    /** 读输入框当前值（回车前的上屏校验用）。 */
    const composerValue = async (page) => await page.evaluate(composerValueInPage, { selector: config.chatSelectors.composer });
    /** 清空输入框（有修饰键能力时；没有就跳过 —— 绝不 DOM 改写）。 */
    const clearComposer = async (page) => {
        const keyboard = page.keyboard;
        if (keyboard === undefined || keyboard.down === undefined || keyboard.up === undefined)
            return;
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await keyboard.down(modifier);
        await keyboard.press('KeyA');
        await keyboard.up(modifier);
        await keyboard.press('Backspace');
    };
    /**
     * 把话术打进输入框 —— **带上屏校验与二次聚焦回退**（这条链路的核心护栏）。
     *
     * 顺序：点击聚焦 → `insertText` 逐字符（拟人）→ 读 `value` 校验；
     * 不等 → 再点击聚焦一次（第一次实验的失败形态就是"点击落在动画中的弹窗上、
     * 焦点没进输入框"）→ `keyboard.type` 真键盘逐键（keydown/keypress/input/keyup 全套）→
     * 再校验。**两路都不上屏就返回 ok=false**，调用方绝不按回车 ——
     * 半截/空文本发出去就是给对面发了一条残句。
     */
    const typeIntoComposer = async (page, text) => {
        const keyboard = page.keyboard;
        if (keyboard === undefined)
            return { ok: false, via: 'no-keyboard', value: '' };
        if ((await clickSelector(page, config.chatSelectors.composer)) === null) {
            return { ok: false, via: 'click', value: '' };
        }
        await clearComposer(page);
        await humanType(keyboard, text, { wait: (ms) => page.waitForTimeout(ms) });
        await page.waitForTimeout(400);
        let value = await composerValue(page);
        if (value === text)
            return { ok: true, via: 'insertText', value };
        if (keyboard.type !== undefined) {
            if ((await clickSelector(page, config.chatSelectors.composer)) === null) {
                return { ok: false, via: 'refocus', value };
            }
            await clearComposer(page);
            await keyboard.type(text, { delay: 55 });
            await page.waitForTimeout(400);
            value = await composerValue(page);
            if (value === text)
                return { ok: true, via: 'keyboard.type', value };
        }
        return { ok: false, via: 'both', value };
    };
    /** 读当前会话里这条消息的送达状态（判据见 `readChatMessagesInPage`）。 */
    const readDelivery = async (page, text) => (await page.evaluate(readChatMessagesInPage, {
        selectors: config.chatSelectors,
        expectText: text,
    })).state;
    /**
     * 轮询确认送达。看到 `delivered` 后**再等一拍复核一次** —— 消息可能在"曾经出现"之后
     * 被平台回滚，一次采样不足以记为送达（zhipin 同款）。
     */
    const waitForDelivery = async (page, text) => {
        const { attempts, intervalMs } = config.deliveryPoll;
        let last = 'missing';
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            last = await readDelivery(page, text);
            if (last === 'delivered') {
                await page.waitForTimeout(Math.max(800, intervalMs));
                const confirm = await readDelivery(page, text);
                return confirm === 'delivered' ? 'delivered' : confirm;
            }
            await page.waitForTimeout(intervalMs);
        }
        return last;
    };
    /**
     * 输入 + 回车 + 送达轮询 —— `sayHello` 与 `reply` 的共同尾段（幂等检查也在里面）。
     */
    const typeSendVerify = async (page, text) => {
        // 消息级幂等：同文本已送达就不重发（重新点「继续聊」会走到这里）。
        const existing = await readDelivery(page, text);
        if (existing === 'delivered') {
            return { ok: true, delivery: 'delivered', evidence: 'dom', idempotentHit: true };
        }
        if (existing === 'pending') {
            return {
                ok: false,
                delivery: 'pending',
                evidence: 'dom',
                message: '会话里已有一条**相同文本**且仍在发送中 —— 不重发，请人工检查。',
            };
        }
        const typed = await typeIntoComposer(page, text);
        if (!typed.ok) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: `话术没能输入到输入框（键盘路径=${typed.via}，textarea.value=${JSON.stringify(typed.value)}）` +
                    '—— **没有按回车，未发送任何消息**。猎聘这个输入框需要完整的键盘事件序列，' +
                    '若反复出现请重跑 probe:liepin-chat 的发送实验核对。',
            };
        }
        await pressSend(page);
        const state = await waitForDelivery(page, text);
        if (state === 'delivered')
            return { ok: true, delivery: 'delivered', evidence: 'dom' };
        if (state === 'pending') {
            return {
                ok: false,
                delivery: 'pending',
                evidence: 'dom',
                message: '消息已出现在会话里但仍在「发送中」，未能确认送达。',
            };
        }
        return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message: '已按回车，但会话里没有确认到这条消息 —— 按未发送处理（不重试，避免重复发送；请人工检查会话）。',
        };
    };
    /**
     * 抓会话列表（**翻页**）—— `readInbox` 用。
     *
     * ## 停手与失败口径（与智联 `fetchTalkRows` 同一套路）
     *
     *   * **停手**：某页不满一页（含空页）→ 到底了；或翻到 `contactListMaxPages`。
     *     ⚠️ 不能看响应里的 `hasNext`/`hasMore`/`totalCount`/`pageSize` —— 实测
     *     `list.length = 8` 而它们全是 0/false（四个汇总量都是坏的）。
     *   * **失败一律抛**，绝不返回空数组：接口没通 / `flag ≠ 1` / 结构不认识 ⇒ 抛。
     *     只有"服务端真的给了空 `list`"才算**可信的 0 条**。
     *   * 跨页按会话 id 去重（翻页期间来了新消息会让会话挪页，那样会出现重复行）。
     */
    const fetchContactRows = async (page) => {
        const collected = [];
        const seen = new Set();
        for (let pageNo = 1; pageNo <= config.contactListMaxPages; pageNo += 1) {
            // 页与页之间给间隔：同一站点其它链路都有拟人间隔，这里零间隔连发是突兀的节奏。
            if (pageNo > 1 && delayMax > 0)
                await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
            const payload = await page.evaluate(fetchContactListInPage, {
                apiPath: `${config.searchApiOrigin}${config.contactListApiPath}`,
                body: buildContactListBody({ page: pageNo, pageSize: config.contactListPageSize }),
                headers: config.apiHeaders,
            });
            if (payload === null) {
                throw new Error(`猎聘会话列表接口没调通（第 ${String(pageNo)} 页）—— 请求失败 / 未登录。` +
                    '**这一条不能当成"没人回我"**：先查登录态与 `x-fscp-*` 那一族请求头（少一项即 -1400）');
            }
            // 能认出是哪类风控（返回文本里的"登录/频繁/额度"）就抛风控错误 ——
            // 由 guard 写平台级暂停并翻成人话，而不是被压成一句普通失败。
            const flag = payload.flag;
            if (flag !== undefined && Number(flag) !== 1) {
                const code = payload.code;
                const message = payload.msg;
                const detail = `${String(code === undefined ? '' : code)} ${String(message === undefined ? '' : message)}`.trim();
                const block = blockFromApiFailure({
                    code: Number.isFinite(Number(code)) ? Number(code) : null,
                    message: detail,
                });
                if (block !== null) {
                    throw new PlatformBlockedError(block, `会话列表接口返回 flag=${String(flag)}：${detail}`);
                }
                throw new Error(`猎聘会话列表接口返回 flag=${String(flag)}（第 ${String(pageNo)} 页）：${detail} —— ` +
                    '结构/鉴权变了，按"没读到"处理，不当成 0 条');
            }
            const rows = contactRowsOf(payload);
            if (rows === null) {
                throw new Error(`猎聘会话列表响应结构不认识（第 ${String(pageNo)} 页）—— 既不是空表也不是会话行数组。` +
                    '**不许当成 0 条**：判空只能来自真的空 `data.list`');
            }
            for (const row of rows) {
                if (seen.has(row.id))
                    continue;
                seen.add(row.id);
                collected.push(row);
            }
            if (rows.length < config.contactListPageSize)
                break;
        }
        return collected;
    };
    /**
     * 收件箱：读会话列表（§13 U6）。
     *
     * 导航到**搜索页**再读 —— 不是随便挑一页：IM 微前端（`lp_fe_im_pc`）挂在任意
     * liepin 页面的侧边栏上，而这个接口的调用形态（origin/referer + `x-fscp-*` 一族）
     * 是在**搜索页上下文**里验证过的（2026-09-20 探针的"适配器头"变体就是在那儿跑通的）。
     * 换一个页面等于换一套没验过的前置条件。
     */
    const readInbox = async (page) => {
        const url = buildLiepinSearchUrl(config, {});
        if (url === null) {
            throw new Error('liepin: 会话列表读不到搜索页地址（buildSearchUrl 返回 null）—— 拒绝在没有验证过的页面上读');
        }
        await page.goto(url);
        // 先判墙：页面被登录墙/验证码（猎聘还会把页面销毁成 about:blank）顶掉时，
        // 接口那边只会得到一句笼统失败 —— 这里能直接说清是什么墙。
        await ctx.assertActionPage(page);
        return (await fetchContactRows(page)).map(inboxMessageOf);
    };
    /**
     * 打招呼（详情页发起）。
     *
     * 流程：详情页 → 判墙 → 找「聊一聊」（排除侧边栏）→ 停留 → 悬停 + 点击 →
     * **等"拒绝弹窗"或"输入框"谁先出现**（`open-chat` 的 HTTP 应答看不到，受理/被拒
     * 只能靠 DOM 后果分辨）→ 幂等检查 → 输入（带上屏校验）→ 回车 → 送达轮询。
     *
     * ⚠️ 副作用（写在 `greetingSideEffect`，审批文案会带上）：平台会在会话里插入一条
     * 「打招呼语建议」系统卡片（extType 200），但**不会替你发出任何消息** ——
     * 真正发出的就是本次传入的话术。
     */
    const sayHello = async (page, job, text) => {
        if (page.mouse === undefined || page.keyboard === undefined)
            return missingInputSurface();
        await page.goto(job.sourceUrl);
        // ⚠️ 判墙在等元素之前：详情页被风控销毁成 about:blank 时，「聊一聊」永远等不到。
        await ctx.assertActionPage(page);
        const button = await locate(page, config.chatSelectors.chatButton, config.chatSelectors.chatButtonText, config.chatSelectors.chatButtonExclude);
        if (!button.found) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '岗位详情页没出现「聊一聊」入口 —— 可能岗位已关闭、入口需登录，或已被风控拦截。不重试。',
            };
        }
        await dwell(page, config.dwellBeforeGreetMs);
        const clicked = await clickSelector(page, config.chatSelectors.chatButton, config.chatSelectors.chatButtonText, config.chatSelectors.chatButtonExclude);
        if (clicked === null) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '找到「聊一聊」入口但坐标定位失败（元素不可见/无尺寸），未点击。',
            };
        }
        // 等"拒绝弹窗"或"输入框"谁先出现 —— 这是受理/被拒的唯一可观测判据。
        const deadline = Date.now() + config.actionWaitMs;
        let sawResumeModal = false;
        let sawComposer = false;
        while (Date.now() < deadline) {
            sawResumeModal = await page.evaluate(hasSelectorInPage, {
                selector: config.chatSelectors.completeResumeModal,
            });
            if (sawResumeModal)
                break;
            sawComposer = await page.evaluate(hasSelectorInPage, { selector: config.chatSelectors.composer });
            if (sawComposer)
                break;
            await page.waitForTimeout(400);
        }
        if (sawResumeModal) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'dom',
                message: '平台**拒绝**了这次沟通：弹出「简历完整度不足」（open-chat code 30011）——' +
                    '请先在猎聘完善简历再打招呼。未发送任何消息。',
            };
        }
        if (!sawComposer) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: `点了「聊一聊」，但 ${String(config.actionWaitMs / 1000)} 秒内既没弹「完善简历」也没出现会话输入框` +
                    '（可能未登录 / 会话面板加载失败）—— 未发送。',
            };
        }
        // 会话已建立（受理的 DOM 证据）。幂等 + 输入 + 回车 + 送达 —— 与 reply 共用尾段。
        return await typeSendVerify(page, text);
    };
    /**
     * 在**已有会话**里回一条消息。
     *
     * 流程：搜索页（IM 微前端在侧边栏，`#im-c-entry` 的内层是懒加载的 ——
     * 详情页上不保证渲染，搜索页稳定）→ 判墙 → 点「我的沟通」开抽屉 →
     * 按**公司名**匹配会话行（`.im-ui-contact-title-sub` 实测格式「HR·公司名」）→
     * 点开 → 停留 → 幂等 + 输入 + 回车 + 送达。
     *
     * 匹配不到会话行就如实报 missing —— 猎聘 IM 按**人**归并（同一 HR 招多个岗时
     * 公司名可能撞），宁可不发也不猜。
     */
    const reply = async (page, job, text) => {
        if (page.mouse === undefined || page.keyboard === undefined)
            return missingInputSurface();
        const url = buildLiepinSearchUrl(config, {});
        if (url === null) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '构造不出搜索页地址（城市码配置异常）—— 未发送。',
            };
        }
        await page.goto(url);
        await ctx.assertActionPage(page);
        // ⚠️ 等**内层** `.im-ui-basic-entry`（懒加载完成才存在），不是外层 `#im-c-entry`：
        // 2026-09-20 实测详情页上外层在、内层没渲染 ⇒ 按外层等会恒真、点了个空。
        if (!(await waitFor(page, config.chatSelectors.drawerEntry, config.actionWaitMs))) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '侧边栏「我的沟通」入口没渲染出来（IM 微前端未加载 / 未登录）—— 未发送。',
            };
        }
        if ((await clickSelector(page, config.chatSelectors.drawerEntry)) === null) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '找到「我的沟通」入口但坐标定位失败，未点击。',
            };
        }
        if (!(await waitFor(page, config.chatSelectors.contactRow, config.actionWaitMs))) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '抽屉打开了但里面没有会话行（可能 0 条会话，或选择器已变）—— 未发送。',
            };
        }
        const hint = job.company !== '' ? job.company : job.title;
        if (hint === '') {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '岗位既没有公司名也没有标题，无法在会话列表里定位 —— 未发送。',
            };
        }
        const row = await clickSelector(page, config.chatSelectors.contactRow, hint);
        if (row === null) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: `会话列表里没找到「${hint}」的会话 —— 可能对方还没回过话（会话不存在）、` +
                    '会话已被平台归档，或同名公司有多条会话但均不可见。未发送。',
            };
        }
        if (!(await waitFor(page, config.chatSelectors.composer, config.actionWaitMs))) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '点开了会话但输入框没出现（面板加载失败？）—— 未发送。',
            };
        }
        // 会话面板打开了再判一次墙（点行之后页面仍可能被风控接管）。
        await ctx.assertActionPage(page);
        await dwell(page, config.dwellBeforeReplyMs);
        return await typeSendVerify(page, text);
    };
    return { readInbox, sayHello, reply };
}
/*
 * ⚠️ `sendResume` / `detectStage` 仍然不实现 —— 这是**结论**，不是还没做：
 *   * `sendResume`：投递入口 `a.btn-minor`「投简历」只取过证（未点过），
 *     猎聘投递**有没有二级确认未实测** —— 不可逆动作上没有实测过的确认链路就不写；
 *   * `detectStage`：会话按**人**归并、调用只给 `{title, company, sourceUrl}`，
 *     拿不到与 `bizData.jobId`（数字 id）对齐的键 —— 只有 HR 主动发来的会话带岗位卡，覆盖不全。
 */
//# sourceMappingURL=actions.js.map