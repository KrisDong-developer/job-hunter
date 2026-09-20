/**
 * 智联的**动作链**（收件箱 / 接触阶段 / 投递）：从 `index.ts` 的工厂闭包里搬出来装配，
 * 因为三个动作共用同一套私有工具（`waitFor` 的容错等待、`fetchTalkRows` 的会话列表翻页）。
 *
 * ⚠️ 三个动作的方法体与原实现**逐字一致**，只把闭包依赖显式化：`assertActionPage(page)` →
 * `ctx.assertActionPage(page)`（判墙的唯一实现仍在 `index.ts`，`guard.detectBlock` 也要用它）。
 * 完整实测记录见 `./index.ts` 文件头（会话接口样本、投递为何走页面驱动、送达语义）。
 */
import type { ContactStage } from '../../../../shared/contract/enums/pipeline.js'
import { blockFromApiFailure } from '../../block-signals.js'
import { dwellBeforeActMs, humanClick, humanHover } from '../../humanize.js'
import { humanDelayMs } from '../../pacing.js'
import type { ActionResult, PageLike, RawInboxMessage, SiteAdapter } from '../../types.js'
import { PlatformBlockedError } from '../../types.js'
import type { ZhaopinTalkRow } from './api.js'
import { fetchTalkListInPage, mapTalkRowsToInbox, stageOfTalkRow, talkRowsOf } from './api.js'
import type { ZhaopinConfig } from './config.js'
import { ZHAOPIN_APPLY_ENTRY_TEXT } from './config.js'
import { applyEntryStateInPage, applySuccessInPage, elementCenterInPage } from './page/apply.js'
import { buildTalkListUrl } from './urls.js'

export interface ZhaopinActionsContext {
  config: ZhaopinConfig
  /** 抓取请求之间的拟人延时区间（工厂从 `options.delayRangeMs` 读到的那一份）。 */
  delayRangeMs: [number, number]
  /** 判墙实现留在 index.ts（`guard.detectBlock` 也要用它 —— 一处实现两个消费者），这里只拿断言入口。 */
  assertActionPage(page: PageLike): Promise<void>
  /**
   * 等会话页容器渲染出来的上限（ms），工厂从 `options.waitForListMs` 读到的那一份。
   *
   * ⚠️ 这是搬运时**必须**补上的一项：`readInbox` 原实现读的是工厂闭包里的
   * `options.waitForListMs`（数据以接口为准，这次等待只是"页面确实到了会话页"的旁证）。
   */
  waitForListMs?: number
}

/**
 * 装配智联的动作链。**这里是动作链唯一的入口**：`index.ts` 只负责把配置、延时区间
 * 与判墙断言传进来（判墙不能搬走 —— `guard.detectBlock` 是它的另一个消费者）。
 */
export function createZhaopinActions(ctx: ZhaopinActionsContext): NonNullable<SiteAdapter['actions']> {
  const config = ctx.config
  // 闭包依赖在这里显式取值，方法体其余部分与原实现逐字一致
  const [delayMin, delayMax] = ctx.delayRangeMs
  const waitForListMs = ctx.waitForListMs ?? 15_000

  /**
   * 等一个选择器出现。超时**返回 false**，不抛。
   *
   * ⚠️ 真路径是 Playwright 的 `waitForSelector`（超时**抛错**），离线夹具返回 `false` ——
   * 所以必须 try/catch 把两条路径拉平，否则又会是"夹具通过、真机抛错"那种最难查的偏差。
   */
  const waitFor = async (page: PageLike, selector: string, timeoutMs: number): Promise<boolean> => {
    const wait = page.waitForSelector
    if (wait === undefined) return false
    try {
      return (await wait.call(page, selector, timeoutMs)) !== false
    } catch {
      return false
    }
  }

  /**
   * 抓会话列表（**翻页**，readInbox 与 detectStage 共用）。
   *
   * 停手条件：某页不满一页（含空页）→ 到底了；或翻到 `talkListMaxPages`。
   * 跨页按会话 id 去重 —— 翻页期间来了新消息会让同一条会话挪到下一页，那会造成重复。
   *
   * ⚠️ 这里**不吞异常**：接口失败 / code≠200 / 结构变了都直接抛。「0 条必须可信」——
   * 只有"某页真的返回 0 条"才算读完了，而"读不到"必须让上层看见。
   */
  const fetchTalkRows = async (page: PageLike): Promise<ZhaopinTalkRow[]> => {
    const collected: ZhaopinTalkRow[] = []
    const seen = new Set<string>()
    for (let pageNo = 1; pageNo <= config.talkListMaxPages; pageNo += 1) {
      // 页与页之间给个间隔：整条 IM 链路原先**一次等待都没有**（最多 3 页接口连发），
      // 而同一站点的搜索/详情链路都有 1.2–3.2s 的拟人间隔 —— 一个站点并存两种节奏
      // 本身就是可识别的特征（`domain/crawl.ts` 给详情补抓写的注释是同一件事）。
      if (pageNo > 1 && delayMax > 0) await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
      const result = await page.evaluate(fetchTalkListInPage, {
        url: buildTalkListUrl(config, pageNo),
      })
      if (!result.ok) {
        throw new Error(
          `智联会话列表接口没调通（第 ${String(pageNo)} 页）：${result.message}` +
            '（**这一条不能当成"没人回我"**，先查登录态 / 风控）',
        )
      }
      if (result.code !== 200) {
        // 能认出是哪一类风控就**抛风控错误**（由 guard 写平台级暂停 + 说人话）；
        // 认不出来仍是原来的普通错误 —— 不猜（见 `blockFromApiFailure`）。
        const block = blockFromApiFailure({ code: result.code, message: result.message })
        if (block !== null) {
          throw new PlatformBlockedError(
            block,
            `会话列表接口返回 code=${String(result.code)}：${result.message}`,
          )
        }
        throw new Error(
          `智联会话列表接口返回 code=${String(result.code)}（第 ${String(pageNo)} 页）：${result.message}`,
        )
      }
      const rows = talkRowsOf(result.payload)
      for (const row of rows) {
        const key = row.sessionid !== '' ? row.sessionid : row.peerPartnerId
        if (key !== '') {
          if (seen.has(key)) continue
          seen.add(key)
        }
        collected.push(row)
      }
      if (rows.length < config.talkListPageSize) break
    }
    return collected
  }

  /**
   * 收件箱：把会话列表读进来（§13 U6）。
   *
   * 2026-09-18 登录态实测后的实现选择：**接口优先**（`getTalkList`）。
   * 理由不是"接口更省事"，而是**只有接口有方向与已读/已回标记** ——
   * DOM 里那套 `.im-session-item` 拿不到"最后一条是谁发的"，
   * 而猜方向会让"我发的话"变成"HR 说的"（§4.2.4 最不能容忍的那种错）。
   *
   * 「0 条必须可信」：接口失败 → **抛错**（绝不返回空数组）；接口 code≠200 → 抛错；
   * 结构变了 → 抛错。只有 `code:200 + data:[]` 才算"真的没有会话"。
   *
   * 会话多于一页时会**翻页**（实测翻页有效，见 `talkListMaxPages`），最多 3 页 / 60 条。
   */
  const readInbox = async (page: PageLike): Promise<RawInboxMessage[]> => {
    await page.goto(config.imUrl)
    // 先判墙：会话页被登录墙/验证码顶掉时，接口那边只会得到一句 code≠200
    // （或者更糟：一句读不出原因的失败），而这里能直接说清是什么墙。
    await ctx.assertActionPage(page)
    // 等**容器**而不是等行（zhipin 那边踩过的同一个坑）：空列表时容器在、行不在，
    // 等行会把"真的空"拖成一次超时。这里超时不报错 —— 数据以接口为准，
    // DOM 只是"页面确实到了会话页、没被弹去登录页"的旁证。
    const waitTarget =
      config.imSelectors.listContainer !== ''
        ? config.imSelectors.listContainer
        : config.imSelectors.sessionRow
    await waitFor(page, waitTarget, waitForListMs)
    return mapTalkRowsToInbox(await fetchTalkRows(page))
  }

  /**
   * 探测某个岗位当前的接触阶段。
   *
   * 判据来自会话行上的 `unreadCount` / `oppositeReply` / `oppositeRead` / `selfReply`
   * （见 `stageOfTalkRow` 的说明与样本现状）。**匹配不到会话行就返回 `null`** ——
   * 「从没接触过」与「会话被平台归档了」在这里分不清，写成 `none` 就是记错账。
   */
  const detectStage = async (
    page: PageLike,
    job: { title: string; company: string; sourceUrl: string },
  ): Promise<ContactStage | null> => {
    await page.goto(config.imUrl)
    await ctx.assertActionPage(page)
    let rows: ZhaopinTalkRow[]
    try {
      rows = await fetchTalkRows(page)
    } catch (error) {
      // **风控证据不能吞**：接口挂了 / 形状变了确实可以"恰当地判不出来"（契约允许 null），
      // 但"登录态失效 / 被限流"必须冒泡上去 —— 吞掉它等于把平台级信号咽下去。
      if (error instanceof PlatformBlockedError) throw error
      // 其余情况：这里**不猜**，如实返回"判不出来"，上层保留原值
      return null
    }
    // 首选**岗位号**匹配：会话行的 `jobNumber` 就是详情 URL 里那个 id
    // （实测两处同值：`CC657755130J40874315311` 同时出现在 URL 与会话行里）。
    // 公司名/岗位名只是兜底 —— 它们会被平台改写（加后缀、去空格），拿它们当主判据会漏。
    const jobIdFromUrl = /\/jobdetail\/([0-9A-Za-z~_-]+)\.htm/.exec(job.sourceUrl)?.[1] ?? ''
    const company = job.company.trim()
    const title = job.title.trim()
    const row =
      (jobIdFromUrl === ''
        ? undefined
        : rows.find((item) => item.jobNumber === jobIdFromUrl)) ??
      rows.find(
        (item) =>
          (company !== '' && item.companyName.trim() === company) ||
          (title !== '' && item.jobTitle.trim() === title),
      )
    return row === undefined ? null : stageOfTalkRow(row)
  }

  /**
   * 投递简历（§22.4 高危）。
   *
   * ⚠️ **一次点击 = 投简历 + 平台自动发一句招呼语，而且不可逆**
   * （实测结果弹窗 `.deliver-greeting-modal`：「已向对方发送简历和打招呼语」）。
   *
   * ## 为什么是**页面驱动**而不是接口化（这是实测后的结论，不是偷懒）
   *
   * 本轮把投递的接口链抓全了（`application/preparation` → `bdp/interceptService/intercept`
   * → `jobs/application` → `imapi/imV2/getUserPrologueNew`），但**没有采用**，因为：
   *   * `preparation` 要 `rootOrgId`(公司 id) 与 `staffId`(HR id) —— 详情页载荷里这两个键
   *     **出现 0 次**（实测 grep），从 `{title, company, sourceUrl}` 推不出来；
   *   * `application` 还要 `cityIds`/`pageCode`/`jobSource`/`attachmentDefaultFileId`/
   *     `businessSystem`/`stSourceCode` … 十来个上下文字段，哪些必需**没人知道**。
   * 在一个**不可逆**的动作上编这些字段是不能接受的（编错 = 投错岗 / 投错简历）。
   * 页面驱动让平台自己拼请求，我们只负责"点"和"看结果" —— 也正是用户自己的操作路径。
   *
   * ## 送达语义
   *   * 看到那个成功弹窗（且文案是「已向对方发送简历…」）→ `delivered`；
   *   * 点了但没看到 → `pending` + "去「我的投递」核对，**别立刻重试**"（重试会投出第二份）；
   *   * 入口文案不是「立即投递」→ `missing` 且**一个字都不点**（多半已投过/已沟通）。
   */
  const sendResume = async (
    page: PageLike,
    job: { title: string; company: string; sourceUrl: string },
    filePath: string | null,
  ): Promise<ActionResult> => {
    if (page.mouse === undefined) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message:
          '当前页面没有 CDP 鼠标能力 —— 拒绝用 DOM 事件冒充真人点击' +
          '（isTrusted=false 是最廉价的自动化特征）。这次按未投递处理。',
      }
    }
    if (filePath !== null) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message:
          '智联的投递只用**平台内简历**：`application/preparation` 返回的是平台自己的简历列表' +
          '（在线简历 + 已上传的附件简历 id），页面上的「立即投递」也只让你从中选，' +
          '**没有"把这次投递指定成本地文件"的入口**。请先在智联「我的简历」里上传附件简历，' +
          '再用 filePath=null 投递（那时平台会用它自己的默认简历）。',
      }
    }

    await page.goto(job.sourceUrl)
    // 判墙先于一切（**包括等入口**）：被验证码/限流页顶掉时「立即投递」永远等不到，
    // 那次等待会白等 20 秒、最后以"找不到投递入口"收场 —— 恰好把风控信号咽掉。
    await ctx.assertActionPage(page)
    await waitFor(page, config.applySelectors.entry, config.applyWaitMs)

    // 登录墙：实测（`probe:zhaopin-anon`，未登录）**详情页照样会渲染出「立即投递」按钮**，
    // 点下去只会被弹到 `passport.zhaopin.com/login`。真正的登录检查在上游
    // （`guard/actions/application.ts` 调适配器之前会复查 `session.status().loggedIn`），
    // 但**记录可能是旧的**（cookie 过期、状态还写着已登录）—— 那时若不识别，就会得到
    // 一条"点了没确认到、别急着重试"的假警报。所以这里认一下登录页。
    const onLoginPage = (): boolean => /^https?:\/\/passport\.zhaopin\.com\/login/i.test(page.url())
    if (onLoginPage()) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message: `详情页直接把你弹到了登录页（${page.url().slice(0, 80)}）—— 未登录，**没有点任何东西**。`,
      }
    }

    const entry = await page.evaluate(applyEntryStateInPage, {
      selector: config.applySelectors.entry,
    })
    if (!entry.found) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message:
          `详情页上找不到投递入口（${config.applySelectors.entry}）—— 可能未登录、或页面版式已变。` +
          '**没有点任何东西。**',
      }
    }
    if (entry.text !== ZHAOPIN_APPLY_ENTRY_TEXT) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message:
          `投递入口的文案是「${entry.text}」，不是「${ZHAOPIN_APPLY_ENTRY_TEXT}」—— 通常意味着` +
          '**这个岗位已经投过或已经沟通过**。为避免重复投递，**这一下没有点**；' +
          '请到智联「我的投递」核对。',
      }
    }

    const spot = await page.evaluate(elementCenterInPage, { selector: config.applySelectors.entry })
    if (!spot.found) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message: '投递入口存在但不可见/不可点（可能被遮挡）—— 没有点，避免点空。',
      }
    }
    // ── 动手之前先停下来 ──────────────────────────────────────────
    // 这是全链路唯一**不可逆**的一步（一次点击 = 投简历 + 平台替你发一句招呼语），
    // 而原先这里唯一的"拟人成本"是 `humanClick` 内部的 240ms —— 真人不会
    // 页面刚渲染完就把简历投出去。停留区间走配置（`dwellBeforeApplyMs`，15–30s）。
    if (config.dwellBeforeApplyMs[1] > 0) {
      await page.waitForTimeout(
        dwellBeforeActMs({
          minMs: config.dwellBeforeApplyMs[0],
          maxMs: config.dwellBeforeApplyMs[1],
        }),
      )
    }
    // 再悬停到按钮上停一下，然后才按下去（悬停是"看清了位置"的物理表现）
    await humanHover(page.mouse, spot.x, spot.y, { wait: (ms) => page.waitForTimeout(ms) })
    await humanClick(page.mouse, spot.x, spot.y, { wait: (ms) => page.waitForTimeout(ms) })

    // 送达校验：等成功弹窗，并确认它写的是"已发送简历"那句（而不是别的弹窗）
    const appeared = await waitFor(page, config.applySelectors.successModal, config.applyWaitMs)
    const success = await page
      .evaluate(applySuccessInPage, {
        selector: config.applySelectors.successModal,
        textIncludes: config.applySelectors.successText,
      })
      .catch(() => ({ visible: false, text: '' }))
    if (success.visible) {
      return { ok: true, delivery: 'delivered', evidence: 'dom' }
    }
    // 点了之后才发现落在登录页 ⇒ 这次点击**肯定没投出去**（登录墙挡在前面）。
    // 若只按"没看到成功弹窗"处理会得到 `pending`（"别急着重试"），那是一条吓人的假警报。
    if (onLoginPage()) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'dom',
        message:
          `点了「${ZHAOPIN_APPLY_ENTRY_TEXT}」之后被弹到登录页（${page.url().slice(0, 80)}）—— ` +
          '**这次没有投出去**（登录态已失效）。先重新登录，再决定要不要投。',
      }
    }
    // 分清三种"没看到成功"：元素根本不出现 / 元素在但一直隐藏（模板常驻 DOM）/ 文案不对。
    // 它们的处理动作相同（去核对、别重试），但**说出来的话**必须不同 —— 否则维护者会误判。
    const sawSomething = appeared && success.text !== ''
    return {
      ok: false,
      delivery: 'pending',
      evidence: sawSomething ? 'dom' : 'none',
      message: sawSomething
        ? `已点击投递，但**没能确认成功**（弹窗元素在 DOM 里，` +
          `${success.visible ? '但文案不是预期的' : '但一直是隐藏的'}：「${success.text.slice(0, 60)}」）—— ` +
          '请去智联「我的投递」核对，**不要立刻重试**。'
        : '已点击投递，但**没有任何成功提示出现**（可能被风控拦下，也可能只是没渲染出来）。' +
          '这是一次**不可逆**的动作 —— 请去智联「我的投递」核对结果，' +
          '**不要立刻重试**（重试可能投出第二份）。',
    }
  }

  return { readInbox, detectStage, sendResume }
}
