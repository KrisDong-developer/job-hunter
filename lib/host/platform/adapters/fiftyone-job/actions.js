import { dwellBeforeActMs as dwellMs, humanClick as clickFn, humanHover as hoverFn, humanPress as pressFn, humanType as typeFn, } from '../../humanize.js';
import { elementCenterInPage, hasSelectorInPage } from './page/list.js';
import { applyDialogStateInPage, chatEntryStateInPage, readChatMessagesInPage } from './page/chat.js';
import { detectStageInPage, readInboxInPage } from './page/inbox.js';
export function createFiftyOneActions(ctx) {
    const config = ctx.config;
    // 判墙实现留在 index.ts（`guard.detectBlock` 与动作链共用）—— 这里只取断言入口。
    const assertActionPage = ctx.assertActionPage;
    /**
     * 等元素出现。
     *
     * 两条路径的**失败形态不同**，必须都归一成布尔：
     *   * 真页面 = Playwright `waitForSelector`：超时**抛错**，成功返回 Locator；
     *   * 离线夹具 = 返回 `true` / `false`（静态 DOM 查一次）。
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
    /** 定位一个可见元素并返回它的信息（不点击）。 */
    const locate = async (page, selector, textIncludes) => await page.evaluate(elementCenterInPage, textIncludes === undefined ? { selector } : { selector, textIncludes });
    /** 拟人点击一个选择器；返回定位信息（失败返回 null）。没有 CDP 鼠标 → 直接 null。 */
    const clickSelector = async (page, selector, textIncludes) => {
        const mouse = page.mouse;
        if (mouse === undefined)
            return null;
        const info = await locate(page, selector, textIncludes);
        if (!info.found)
            return null;
        const wait = (ms) => page.waitForTimeout(ms);
        // 先悬停、再点击：悬停让 hover 才亮的入口可见；"指针到位后停一下才按下"是真人特征。
        await hoverFn(mouse, info.x, info.y, { wait });
        await clickFn(mouse, info.x, info.y, { wait });
        return info;
    };
    /** 清空并逐字符输入（走 humanize；没有修饰键能力时跳过清空）。 */
    const clearAndType = async (page, selector, text) => {
        const keyboard = page.keyboard;
        if (keyboard === undefined)
            return false;
        if ((await clickSelector(page, selector)) === null)
            return false;
        if (keyboard.down !== undefined && keyboard.up !== undefined) {
            const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
            await keyboard.down(modifier);
            await keyboard.press('KeyA');
            await keyboard.up(modifier);
            await keyboard.press('Backspace');
        }
        await typeFn(keyboard, text, { wait: (ms) => page.waitForTimeout(ms) });
        return true;
    };
    /** 动手前的停留（数值口径与其它平台同一份实现：`humanize.dwellBeforeActMs`）。`[0, 0]` = 关闭。 */
    const dwell = async (page, range) => {
        const [min, max] = range;
        if (max <= 0)
            return;
        await page.waitForTimeout(dwellMs({ minMs: min, maxMs: max }));
    };
    /**
     * 发送：优先点「发送」按钮；按钮定位不到时回车兜底。
     *
     * 51job 会话的发送形态未实测（可能按钮、可能 Enter）—— 只用其一会在另一半形态上
     * 卡死，两种都试且**先按钮后回车**（按钮命中即止，不会双发）。
     */
    const send = async (page) => {
        const clicked = await clickSelector(page, config.chatSelectors.sendButton);
        if (clicked !== null)
            return;
        const keyboard = page.keyboard;
        if (keyboard === undefined)
            return;
        await pressFn(keyboard, 'Enter', { wait: (ms) => page.waitForTimeout(ms) });
    };
    /** 读当前会话里这条消息的送达状态。 */
    const readDelivery = async (page, text) => (await page.evaluate(readChatMessagesInPage, {
        selectors: config.chatSelectors,
        expectText: text,
    })).state;
    /**
     * 轮询确认送达。看到 `delivered` 后**再等一拍复核一次** ——
     * 消息可能在"曾经出现"之后被平台回滚，一次采样不足以记为送达。
     */
    const waitForDelivery = async (page, text) => {
        const { attempts, intervalMs } = config.deliveryPoll;
        let last = 'missing';
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            last = await readDelivery(page, text);
            if (last === 'failed')
                return 'failed';
            if (last === 'delivered') {
                await page.waitForTimeout(Math.max(800, intervalMs));
                const confirm = await readDelivery(page, text);
                return confirm === 'delivered' ? 'delivered' : confirm;
            }
            await page.waitForTimeout(intervalMs);
        }
        return last;
    };
    /** 打开某公司的会话（消息页 → 点那一行）。 */
    const openConversation = async (page, job) => {
        const hint = job.company !== '' ? job.company : job.title;
        if (hint === '')
            return false;
        await page.goto(config.chatUrl);
        // 消息页被登录墙/验证码顶掉时，"找不到那一行"会被上层误读成"会话不存在"。
        await assertActionPage(page);
        if (!(await waitFor(page, config.inboxSelectors.row, config.actionWaitMs)))
            return false;
        const row = await clickSelector(page, config.inboxSelectors.row, hint);
        if (row === null)
            return false;
        return await waitFor(page, config.chatSelectors.chatInput, config.actionWaitMs);
    };
    const missingInputSurface = () => ({
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message: '当前页面没有提供 CDP 输入能力（page.mouse / page.keyboard）—— 拒绝用 DOM 事件冒充真人点击' +
            '（isTrusted=false 是最廉价的自动化特征）。这条动作按未发送处理。',
    });
    /**
     * 打招呼。
     *
     * 流程：① 打开岗位详情页 → ② 判墙 → ③ 等「去聊聊」入口 → ④ 拟人停留 →
     * ⑤ CDP 点击 → ⑥ **读入口形态**（未登录 = 微信扫码弹层，实测；登录态 = 站内会话，候选）
     * → ⑦ 进会话后逐字符输入、发送 → ⑧ 校验送达（消息级幂等在前）。
     *
     * 「入口形态」这一步是 51job 特有的关键：**未登录视图点「去聊聊」弹出的是微信扫码
     * 弹层**（`.chat-popover`，实测）—— 那里没有任何可输入面。不读形态就会把
     * "点了个引导扫码的弹层"当成"消息已发出"。
     */
    const sayHello = async (page, job, text) => {
        if (page.mouse === undefined || page.keyboard === undefined)
            return missingInputSurface();
        await page.goto(job.sourceUrl);
        // ⚠️ 判墙必须在**等元素之前**：详情页被 WAF 滑块/登录墙顶掉时，入口永远等不到。
        await assertActionPage(page);
        if (!(await waitFor(page, config.chatSelectors.chatButton, config.actionWaitMs))) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '岗位详情页没出现「去聊聊 / 立即沟通」入口 —— 可能岗位已关闭、未登录，或已被风控拦截。不重试。',
            };
        }
        await dwell(page, config.dwellBeforeGreetMs);
        if ((await clickSelector(page, config.chatSelectors.chatButton)) === null) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '找到沟通入口但坐标定位失败（元素不可见/无尺寸），未点击。',
            };
        }
        // 读形态：扫码弹层（实测）= 没有输入面；站内输入面（候选）= 可以继续。
        const entry = await page.evaluate(chatEntryStateInPage, { selectors: config.chatSelectors });
        if (entry.kind === 'qr-popover') {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'dom',
                message: `点「去聊聊」后出现的是**微信扫码引导弹层**（${entry.hrName === '' ? 'HR 信息未展示' : `HR：${entry.hrName}`}，` +
                    `${entry.tip === '' ? '文案未展示' : `平台提示「${entry.tip}」`}）—— ` +
                    '这一形态下没有可输入的会话框，消息没有发出。请先登录 51job 再用站内沟通。',
            };
        }
        const inChat = entry.kind === 'chat-input' || (await waitFor(page, config.chatSelectors.chatInput, config.actionWaitMs));
        if (!inChat) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '点了沟通入口，但既没有出现扫码弹层、也没有出现会话输入框 —— 登录态会话的 DOM 未校准' +
                    '（chatSelectors.chatInput 候选待真机确认）或入口行为已变。未发送。',
            };
        }
        // 消息级幂等：会话里已有同文本且已送达就不重发。
        const existing = await readDelivery(page, text);
        if (existing === 'delivered') {
            return { ok: true, delivery: 'delivered', evidence: 'dom', idempotentHit: true };
        }
        if (existing === 'failed' || existing === 'pending') {
            return {
                ok: false,
                delivery: existing,
                evidence: 'dom',
                message: `会话里已有一条**相同文本**且状态为「${existing}」的消息 —— 不重发，请人工检查。`,
            };
        }
        if (!(await clearAndType(page, config.chatSelectors.chatInput, text))) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '会话已打开，但没能把话术输入到输入框。',
            };
        }
        await send(page);
        const state = await waitForDelivery(page, text);
        if (state === 'delivered')
            return { ok: true, delivery: 'delivered', evidence: 'dom' };
        if (state === 'failed') {
            return { ok: false, delivery: 'failed', evidence: 'dom', message: '平台把这条消息标记为发送失败。' };
        }
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
            message: '已点击发送，但会话里没有确认到这条消息 —— 按未发送处理（不重试，避免重复发送；请人工检查会话）。',
        };
    };
    /**
     * 在**已有会话**里回一条消息。
     *
     * 复用 `sayHello` 已定型的输入/发送/送达校验，区别只在"怎么命中会话"：
     * 回复是去消息页按公司/岗位标题匹配那一行。51job 消息页地址与行选择器都是候选
     * （`chatUrl` / `inboxSelectors`，DB 可覆盖）—— 命不中就如实报 `missing`。
     */
    const reply = async (page, job, text) => {
        if (page.mouse === undefined || page.keyboard === undefined)
            return missingInputSurface();
        if (!(await openConversation(page, job))) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: `没能在 51job 消息页里找到「${job.company === '' ? job.title : job.company}」的会话 —— ` +
                    '可能是对方还没回过话（会话不存在），或消息页地址/行选择器未校准（chatUrl 可经 DB 覆盖）。未发送。',
            };
        }
        // 回复也是"要发出去的东西"：判墙 + 停留（3–8s，语义是"读完对方那条再回"）。
        await assertActionPage(page);
        await dwell(page, config.dwellBeforeReplyMs);
        const existing = await readDelivery(page, text);
        if (existing === 'delivered') {
            return { ok: true, delivery: 'delivered', evidence: 'dom', idempotentHit: true };
        }
        if (existing === 'failed' || existing === 'pending') {
            return {
                ok: false,
                delivery: existing,
                evidence: 'dom',
                message: `会话里已有一条**相同文本**且状态为「${existing}」的消息 —— 不重发，请人工检查。`,
            };
        }
        if (!(await clearAndType(page, config.chatSelectors.chatInput, text))) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '会话已打开，但没能把回复内容输入到输入框。',
            };
        }
        await send(page);
        const state = await waitForDelivery(page, text);
        if (state === 'delivered')
            return { ok: true, delivery: 'delivered', evidence: 'dom' };
        if (state === 'failed') {
            return { ok: false, delivery: 'failed', evidence: 'dom', message: '平台把这条回复标记为发送失败。' };
        }
        if (state === 'pending') {
            return {
                ok: false,
                delivery: 'pending',
                evidence: 'dom',
                message: '回复已出现在会话里但仍在「发送中」，未能确认送达。',
            };
        }
        return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message: '已点击发送，但会话里没有确认到这条回复 —— 按未发送处理（不重试，避免重复发送）。',
        };
    };
    /**
     * 投递简历（sendResume 的 51job 形态 = 「投递」）。
     *
     * 链路（选择器证据见 `config.ts` 的 `chatSelectors` 注释）：
     *   ① 详情页「投递」`button.btn.apply`（✅ 实测）→ ② `.apply-component-resume-dialog`
     *   选简历弹窗（✅ 样式证据）→ ③ 选中 `.pc-apply-resume__row / __select--resume`
     *   → ④ 确认 → ⑤ `.success_title` / Element Plus 成功 toast 校验。
     *
     * 两条 fail-closed 纪律：
     *   * `filePath ≠ null`：51job 的投递走**平台简历库**（弹窗里选的是账号里的简历），
     *     没有把本地文件直投给 HR 的入口 —— 如实报 `missing` 并指路简历中心，不假装发出；
     *   * 弹窗开着 ≠ 能投：`.apply-component-hint-dialog` 形态（如「今日投递太多」，
     *     见 `quota-exhausted` 判墙信号的出处）与"没有可选简历"都读状态后如实上报，
     *     **绝不**把"点了点不动的按钮"讲成 `pending`。
     */
    const sendResume = async (page, job, filePath) => {
        if (page.mouse === undefined)
            return missingInputSurface();
        // ── 路径一：本地文件 —— 平台没有这个入口，绝不假装发出去了 ──────────
        if (filePath !== null) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '51job 的投递走**平台简历库**（「投递」弹窗里选的是账号里的在线/附件简历），' +
                    '没有把本地文件直接投给 HR 的入口。请先在「我的简历-简历中心」' +
                    '（https://i.51job.com/resume/resume_center.php）上传/更新简历，再用 filePath=null 投递。',
            };
        }
        // ── 路径二：平台内投递（详情页「投递」→ 选简历 → 确认）──────────────
        await page.goto(job.sourceUrl);
        await assertActionPage(page);
        if (!(await waitFor(page, config.chatSelectors.applyButton, config.actionWaitMs))) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '岗位详情页没出现「投递」按钮 —— 可能岗位已关闭、未登录，或已被风控拦截。不重试。',
            };
        }
        // 投递是不可逆动作（HR 侧会收到一份投递记录），停留给到最长一档。
        await dwell(page, config.dwellBeforeApplyMs);
        if ((await clickSelector(page, config.chatSelectors.applyButton, '投递')) === null) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '「投递」按钮可见但坐标定位失败（元素不可见/无尺寸），未点击。',
            };
        }
        // 等弹窗：简历选择形态或提示形态（「今日投递太多」这类平台提示）都算"弹了窗"。
        const dialogSelector = `${config.chatSelectors.applyDialog}, ${config.chatSelectors.applyHintDialog}`;
        if (!(await waitFor(page, dialogSelector, config.actionWaitMs))) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '点了「投递」但没有出现简历选择/提示弹窗（选择器可能已变，或登录态缺失）。未投递。',
            };
        }
        const state = await page.evaluate(applyDialogStateInPage, { selectors: config.chatSelectors });
        if (state.rowCount === 0) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'dom',
                message: `投递弹窗里**没有可选的简历**${state.hintText === '' ? '' : `（弹窗内容：「${state.hintText}」）`}—— ` +
                    '可能是平台提示（如今日投递额度用尽），或账号里还没有可用简历。' +
                    '需要先在「我的简历-简历中心」上传。未投递任何东西。',
            };
        }
        if ((await clickSelector(page, config.chatSelectors.applyResumeSelect)) === null) {
            if ((await clickSelector(page, config.chatSelectors.applyResumeRow)) === null) {
                return {
                    ok: false,
                    delivery: 'missing',
                    evidence: 'none',
                    message: '投递弹窗里有简历条目但坐标定位失败（元素不可见/无尺寸），未选中，未投递。',
                };
            }
        }
        // 选中之后再读一次按钮：未选中时它可能是 disabled 的，"点一个点不动的按钮"
        // 会被下游误读成"投了但对方没收到"（delivery=pending）。
        const afterPick = await page.evaluate(applyDialogStateInPage, { selectors: config.chatSelectors });
        if (!afterPick.confirmFound) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '投递弹窗里找不到确认按钮（选择器可能已变），未投递。',
            };
        }
        if (afterPick.confirmDisabled) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'dom',
                message: '选中简历后确认按钮仍是**不可用**状态（带 disabled）—— 平台没接受这次选择，未投递。' +
                    '请在 51job 页面里人工确认简历是否可用。',
            };
        }
        if ((await clickSelector(page, config.chatSelectors.applyDialogConfirm)) === null) {
            return {
                ok: false,
                delivery: 'missing',
                evidence: 'none',
                message: '已选中简历，但点不到弹窗的确认按钮，未投递。',
            };
        }
        const visible = await waitFor(page, config.chatSelectors.applySuccess, config.actionWaitMs);
        if (visible)
            return { ok: true, delivery: 'delivered', evidence: 'dom' };
        return {
            ok: false,
            delivery: 'pending',
            evidence: 'none',
            message: '已在平台弹窗里确认投递，但没看到成功提示，未能确认送达。',
        };
    };
    /**
     * 收件箱：读会话列表（HR 消息）。
     *
     * 纯读动作 —— 只要页面能打开就能做，不需要 CDP 输入面。
     * ⚠️ 容器缺失时 `readInboxInPage` **抛错**（而不是返回空数组）；
     * 「0 条」只会在"容器在、列表空"时出现，那样的 0 条才可信。
     */
    const readInbox = async (page) => {
        await page.goto(config.chatUrl);
        // 等**容器**而不是等行：空列表时容器在、行不在（语义与 zhipin 同款）。
        await waitFor(page, config.inboxSelectors.listContainer !== ''
            ? config.inboxSelectors.listContainer
            : config.inboxSelectors.row, config.actionWaitMs);
        await assertActionPage(page);
        return await page.evaluate(readInboxInPage, { selectors: config.inboxSelectors });
    };
    /**
     * 探测某个岗位当前的接触阶段。
     *
     * 判据沿 zhipin 的口径：列表里没有这一行 → `null`（**不返回 `none`**：分不清
     * "从没打过招呼"和"平台已把会话移出保留窗口"）；认不出状态类名 → `null`（不猜）。
     */
    const detectStage = async (page, job) => {
        await page.goto(config.chatUrl);
        await waitFor(page, config.inboxSelectors.row, config.actionWaitMs);
        // 只读动作也要判墙：消息页被登录墙顶掉时，"找不到那一行"会被误读成"没接触过"。
        await assertActionPage(page);
        const probe = await page.evaluate(detectStageInPage, {
            selectors: config.inboxSelectors,
            company: job.company,
            title: job.title,
        });
        return probe.stage;
    };
    return { sayHello, reply, detectStage, readInbox, sendResume };
}
//# sourceMappingURL=actions.js.map