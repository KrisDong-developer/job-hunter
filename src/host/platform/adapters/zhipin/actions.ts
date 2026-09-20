/**
 * BOSS 直聘的**高危动作实现**（打招呼 / 回复 / 探阶段 / 读收件箱 / 发简历）及其交互工具。
 *
 * DB 覆盖的配置与动作链的接线在 `./index.ts`：本文件只拿 `config` 与**判墙断言入口**
 * （`assertActionPage` 的实现在 index.ts —— `guard.detectBlock` 与动作链共用那一份）。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import type { ContactStage } from '../../../../shared/contract/enums/pipeline.js'
import { dwellBeforeActMs, humanClick, humanHover, humanPress, humanType } from '../../humanize.js'
import type { ActionResult, PageLike, RawInboxMessage, SiteAdapter } from '../../types.js'
import type { ZhipinConfig } from './config.js'
import { INBOX_TAB_LABELS } from './config.js'
import type { ZhipinElementInfo } from './page/list.js'
import { elementCenterInPage, hasSelectorInPage } from './page/list.js'
import {
  chatRowMatchesInPage,
  detectGreetPopupInPage,
  readChatMessagesInPage,
  toolbarButtonStateInPage,
} from './page/chat.js'
import { detectStageInPage, readInboxInPage } from './page/inbox.js'

export interface ZhipinActionsContext {
  config: ZhipinConfig
  /** 判墙实现留在 index.ts（`guard.detectBlock` 也要用它 —— 一处实现两个消费者），这里只拿断言入口。 */
  assertActionPage(page: PageLike): Promise<void>
}

export function createZhipinActions(ctx: ZhipinActionsContext): NonNullable<SiteAdapter['actions']> {
  const config = ctx.config
  // 判墙实现留在 index.ts（`guard.detectBlock` 与动作链共用那一份）—— 这里只取断言入口。
  const assertActionPage = ctx.assertActionPage

  /**
   * 等元素出现。
   *
   * 两条路径的**失败形态不同**，必须都归一成布尔：
   *   * 真页面 = Playwright `waitForSelector`：超时**抛错**，成功返回 Locator；
   *   * 离线夹具 = 返回 `true` / `false`（静态 DOM 查一次）。
   * 所以既不能只看"有没有抛错"（会漏掉夹具的 false），也不能只看返回值。
   */
  const waitFor = async (page: PageLike, selector: string, timeoutMs: number): Promise<boolean> => {
    if (page.waitForSelector !== undefined) {
      try {
        const ready = await page.waitForSelector(selector, timeoutMs)
        return ready !== false
      } catch {
        return false
      }
    }
    const deadline = Date.now() + timeoutMs
    for (;;) {
      if (await page.evaluate(hasSelectorInPage, { selector })) return true
      if (Date.now() >= deadline) return false
      await page.waitForTimeout(150)
    }
  }

  /** 定位一个可见元素并返回它的信息（不点击）。 */
  const locate = async (
    page: PageLike,
    selector: string,
    textIncludes?: string,
  ): Promise<ZhipinElementInfo> =>
    await page.evaluate(
      elementCenterInPage,
      textIncludes === undefined ? { selector } : { selector, textIncludes },
    )

  /** 拟人点击一个选择器；返回定位信息（失败返回 null）。没有 CDP 鼠标 → 直接 null。 */
  const clickSelector = async (
    page: PageLike,
    selector: string,
    textIncludes?: string,
  ): Promise<ZhipinElementInfo | null> => {
    const mouse = page.mouse
    if (mouse === undefined) return null
    const info = await locate(page, selector, textIncludes)
    if (!info.found) return null
    const wait = (ms: number): Promise<void> => page.waitForTimeout(ms)
    // 先悬停、再点击。两件事各有用处：
    //   * 悬停是**必须的**——有的入口（如猎聘的「聊一聊」）要 hover 才亮出来；
    //   * "指针到位后停一下才按下"是真人最稳定的动作特征，而 `humanClick` 本身
    //     只有 60–80ms 级的微调间隔。
    await humanHover(mouse, info.x, info.y, { wait })
    await humanClick(mouse, info.x, info.y, { wait })
    return info
  }

  /** 等某个选择器出现（轮询）；超时返回 false。 */
  const waitForPopup = async (
    page: PageLike,
    timeoutMs: number,
  ): Promise<'preset' | 'startchat' | 'none'> => {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const state = await page.evaluate(detectGreetPopupInPage, {
        selectors: config.chatSelectors,
      })
      if (state.kind !== 'none') return state.kind
      if (Date.now() >= deadline) return 'none'
      await page.waitForTimeout(250)
    }
  }

  /** 读当前会话里这条消息的送达状态。 */
  const readDelivery = async (
    page: PageLike,
    text: string,
  ): Promise<'delivered' | 'pending' | 'failed' | 'missing'> =>
    (
      await page.evaluate(readChatMessagesInPage, {
        selectors: config.chatSelectors,
        expectText: text,
      })
    ).state

  /**
   * 轮询确认送达。看到 `delivered` 后**再等一拍复核一次** ——
   * 消息可能在"曾经出现"之后被平台回滚，一次采样不足以记为送达
   * （BossHunter `_message_delivery_state` 的稳定性复核同款）。
   */
  const waitForDelivery = async (
    page: PageLike,
    text: string,
  ): Promise<'delivered' | 'pending' | 'failed' | 'missing'> => {
    const { attempts, intervalMs } = config.deliveryPoll
    let last: 'delivered' | 'pending' | 'failed' | 'missing' = 'missing'
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      last = await readDelivery(page, text)
      if (last === 'failed') return 'failed'
      if (last === 'delivered') {
        await page.waitForTimeout(Math.max(800, intervalMs))
        const confirm = await readDelivery(page, text)
        return confirm === 'delivered' ? 'delivered' : confirm
      }
      await page.waitForTimeout(intervalMs)
    }
    return last
  }

  /** 打开某公司的会话（收件箱 → 点那一行）。 */
  const openConversation = async (
    page: PageLike,
    job: { title: string; company: string },
  ): Promise<boolean> => {
    const hint = job.company !== '' ? job.company : job.title
    if (hint === '') return false
    await page.goto(config.chatUrl)
    // 会话页被登录墙/验证码顶掉时，下面"找不到那一行"会被上层误读成
    // 「对方还没回过话（会话不存在）」—— 那是把风控说成了业务事实。
    await assertActionPage(page)
    if (!(await waitFor(page, config.inboxSelectors.row, config.actionWaitMs))) return false
    const row = await clickSelector(page, config.inboxSelectors.row, hint)
    if (row === null) return false
    return await waitFor(page, config.chatSelectors.chatInput, config.actionWaitMs)
  }

  /** 清空并逐字符输入（走 humanize；没有修饰键能力时跳过清空）。 */
  const clearAndType = async (page: PageLike, selector: string, text: string): Promise<boolean> => {
    const keyboard = page.keyboard
    if (keyboard === undefined) return false
    if ((await clickSelector(page, selector)) === null) return false
    if (keyboard.down !== undefined && keyboard.up !== undefined) {
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
      await keyboard.down(modifier)
      await keyboard.press('KeyA')
      await keyboard.up(modifier)
      await keyboard.press('Backspace')
    }
    await humanType(keyboard, text, { wait: (ms) => page.waitForTimeout(ms) })
    return true
  }

  /**
   * 动手前的停留（打招呼 / 回复 / 发简历各一档）。
   *
   * 数值口径走 `humanize.dwellBeforeActMs`（与其它平台**同一份实现**），
   * 这里只负责把配置区间传进去。原先这里是自家写的
   * `min + Math.random() * (max - min)` 均匀分布 —— 而全仓的延时口径是
   * `pacing.ts` 的高斯 + 犹豫，同一个系统里并存两种分布本身就是可识别的统计差异。
   * `[0, 0]` 仍然等于关闭（离线测试靠它把每个用例从十几秒压到毫秒）。
   */
  const dwell = async (page: PageLike, range: [number, number]): Promise<void> => {
    const [min, max] = range
    if (max <= 0) return
    await page.waitForTimeout(dwellBeforeActMs({ minMs: min, maxMs: max }))
  }

  /**
   * 回车发送（站点自述「按Enter键发送」，所以走回车而不是点 `.btn-send`）。
   *
   * 按键本身该是瞬时的，但"打完最后一个字 0ms 就回车"不是 —— `humanPress`
   * 在按下前后各留一段停顿（看一眼自己打的字 / 等它上屏）。
   */
  const pressSend = async (page: PageLike): Promise<void> => {
    const keyboard = page.keyboard
    if (keyboard === undefined) return
    await humanPress(keyboard, 'Enter', { wait: (ms) => page.waitForTimeout(ms) })
  }

  const missingInputSurface = (): ActionResult => ({
    ok: false,
    delivery: 'missing',
    evidence: 'none',
    message:
      '当前页面没有提供 CDP 输入能力（page.mouse / page.keyboard）—— 拒绝用 DOM 事件冒充真人点击' +
      '（isTrusted=false 是最廉价的自动化特征）。这条动作按未发送处理。',
  })

  /**
   * 打招呼。
   *
   * 流程（BossHunter `executor/sender.py` 的 `_send_greeting_once` 同款）：
   *   ① 打开岗位详情页 → ② 等「立即沟通」入口 → ③ 幂等检查（会话里已有同文本就不重发）
   *   → ④ 拟人停留 → ⑤ CDP 输入级点击入口 → ⑥ 处理弹窗（预设招呼语 / 首次沟通）
   *   → ⑦ 进入会话、逐字符输入话术、发送 → ⑧ 校验送达。
   *
   * 三种弹窗分支的**送达语义各不相同**，返回值里必须说清：
   *   * 预设招呼语弹窗：点确认即由平台发出**平台预设文案**（不是本次生成的话术）；
   *   * 首次沟通弹窗：在弹窗里填本次话术并提交；
   *   * 无弹窗（「继续沟通」）：直接进会话发本次话术。
   */
  const sayHello = async (
    page: PageLike,
    job: { title: string; company: string; sourceUrl: string },
    text: string,
  ): Promise<ActionResult> => {
    if (page.mouse === undefined || page.keyboard === undefined) return missingInputSurface()

    await page.goto(job.sourceUrl)

    // ⚠️ 判墙必须在**等元素之前**：岗位详情页被验证码/限流页顶掉时，
    // 「立即沟通」按钮永远等不到 —— 那样失败会以"入口没出现（可能岗位已关闭、
    // 未登录，或已被风控拦截）"结束，把"平台已经认出你了"这条关键信号咽掉。
    await assertActionPage(page)

    if (!(await waitFor(page, config.chatSelectors.chatButton, config.actionWaitMs))) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message:
          '岗位详情页没出现「立即沟通 / 继续沟通」入口 —— 可能岗位已关闭、未登录，或已被风控拦截。不重试。',
      }
    }

    await dwell(page, config.dwellBeforeGreetMs)

    const entry = await clickSelector(page, config.chatSelectors.chatButton)
    if (entry === null) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message: '找到沟通入口但坐标定位失败（元素不可见/无尺寸），未点击。',
      }
    }

    const popup = await waitForPopup(page, Math.min(config.actionWaitMs, 6_000))
    if (popup === 'preset') {
      const confirmed = await clickSelector(page, config.chatSelectors.dialogConfirm)
      if (confirmed === null) {
        return {
          ok: false,
          delivery: 'missing',
          evidence: 'none',
          message: '平台弹出了预设招呼语弹窗，但点不到「确定」。',
        }
      }
      return {
        ok: true,
        delivery: 'delivered',
        evidence: 'dom',
        message:
          '平台弹出了**预设招呼语**，已点确认发送 —— 发出去的是平台自带文案，不是本次生成的话术。',
      }
    }

    let submittedInDialog = false
    if (popup === 'startchat') {
      if (!(await clearAndType(page, config.chatSelectors.startchatInput, text))) {
        return {
          ok: false,
          delivery: 'missing',
          evidence: 'none',
          message: '首次沟通弹窗里找不到可输入的招呼语输入框。',
        }
      }
      if ((await clickSelector(page, config.chatSelectors.dialogSend)) === null) {
        return {
          ok: false,
          delivery: 'missing',
          evidence: 'none',
          message: '招呼语已填入首次沟通弹窗，但点不到发送按钮。',
        }
      }
      submittedInDialog = true
    }

    // 进会话：先等同页跳转；若点击另开了标签页（当前页没动），用入口自带的 redirect-url 导航过去。
    let inChat = await waitFor(page, config.chatSelectors.chatInput, 5_000)
    if (!inChat && entry.href !== '') {
      const target = entry.href.startsWith('http') ? entry.href : `https://www.zhipin.com${entry.href}`
      await page.goto(target)
      inChat = await waitFor(page, config.chatSelectors.chatInput, config.actionWaitMs)
    }
    if (!inChat && !submittedInDialog) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message: '点了沟通入口但没有进入会话（没出现聊天输入框），未发送。',
      }
    }

    // 消息级幂等：进入会话后先看这条话术是否已经在里面（重新点「继续沟通」会走这里）。
    // 必须放在**进会话之后** —— 岗位详情页上没有会话消息列表，在详情页上查等于永远查不到。
    if (inChat) {
      const existing = await readDelivery(page, text)
      if (existing === 'delivered') {
        return { ok: true, delivery: 'delivered', evidence: 'dom', idempotentHit: true }
      }
      if (existing === 'failed' || existing === 'pending') {
        return {
          ok: false,
          delivery: existing,
          evidence: 'dom',
          message: `会话里已有一条**相同文本**且状态为「${existing}」的消息 —— 不重发，请人工检查。`,
        }
      }
    }

    if (!submittedInDialog && inChat) {
      if (!(await clearAndType(page, config.chatSelectors.chatInput, text))) {
        return {
          ok: false,
          delivery: 'missing',
          evidence: 'none',
          message: '会话已打开，但没能把话术输入到输入框。',
        }
      }
      await pressSend(page)
    }

    const state = await waitForDelivery(page, text)
    if (state === 'delivered') return { ok: true, delivery: 'delivered', evidence: 'dom' }

    // 交叉验证：当前页看不到消息列表（例如会话在另一个标签页）时，去会话列表核对
    // 「公司 + 完整话术」是否同一行命中（BossHunter `_verify_greeting_in_chat_list`）。
    if (job.company !== '') {
      await page.goto(config.chatUrl)
      if (await waitFor(page, config.inboxSelectors.row, config.actionWaitMs)) {
        const matched = await page.evaluate(chatRowMatchesInPage, {
          selectors: config.inboxSelectors,
          company: job.company,
          expectText: text,
        })
        if (matched) return { ok: true, delivery: 'delivered', evidence: 'dom' }
      }
    }

    if (state === 'failed') {
      return {
        ok: false,
        delivery: 'failed',
        evidence: 'dom',
        message: '平台把这条消息标记为发送失败。',
      }
    }
    if (state === 'pending') {
      return {
        ok: false,
        delivery: 'pending',
        evidence: 'dom',
        message: '消息已出现在会话里但仍在「发送中」，未能确认送达。',
      }
    }
    return {
      ok: false,
      delivery: 'missing',
      evidence: 'none',
      message:
        '已点击发送，但会话里没有确认到这条消息 —— 按未发送处理（不重试，避免重复发送；请人工检查会话）。',
    }
  }

  /**
   * 在**已有会话**里回一条消息。
   *
   * 复用 `sayHello` 已经实测过的那条路径（`#chat-input` 逐字符输入 → Enter → 送达校验），
   * 区别只在"怎么命中会话"：回复是去会话列表按公司/岗位标题匹配那一行，不碰岗位详情页。
   *
   * 幂等语义比打招呼更保守：回复时"同文本已存在"更可能是我之前说过的话，所以
   * 发现同文本且已送达就**不重发**（`idempotentHit`），状态是 failed/pending 也不重发。
   */
  const reply = async (
    page: PageLike,
    job: { title: string; company: string; sourceUrl: string },
    text: string,
  ): Promise<ActionResult> => {
    if (page.mouse === undefined || page.keyboard === undefined) return missingInputSurface()

    if (!(await openConversation(page, job))) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message:
          `没能在会话列表里找到「${job.company === '' ? job.title : job.company}」的会话 —— ` +
          '可能是对方还没回过话（会话不存在），或平台已把它移出保留窗口。未发送。',
      }
    }

    // 同一套判墙 + 停留：回复也是"要发出去的东西"，不能因为"只是回一句"就省掉。
    // 回复的停留比首次打招呼短（3–8s）：语义是"读完对方那条再回"，不是"第一次看这个岗位"。
    await assertActionPage(page)
    await dwell(page, config.dwellBeforeReplyMs)

    const existing = await readDelivery(page, text)
    if (existing === 'delivered') {
      return { ok: true, delivery: 'delivered', evidence: 'dom', idempotentHit: true }
    }
    if (existing === 'failed' || existing === 'pending') {
      return {
        ok: false,
        delivery: existing,
        evidence: 'dom',
        message: `会话里已有一条**相同文本**且状态为「${existing}」的消息 —— 不重发，请人工检查。`,
      }
    }

    if (!(await clearAndType(page, config.chatSelectors.chatInput, text))) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message: '会话已打开，但没能把回复内容输入到输入框。',
      }
    }
    await pressSend(page)

    const state = await waitForDelivery(page, text)
    if (state === 'delivered') return { ok: true, delivery: 'delivered', evidence: 'dom' }
    if (state === 'failed') {
      return { ok: false, delivery: 'failed', evidence: 'dom', message: '平台把这条回复标记为发送失败。' }
    }
    if (state === 'pending') {
      return {
        ok: false,
        delivery: 'pending',
        evidence: 'dom',
        message: '回复已出现在会话里但仍在「发送中」，未能确认送达。',
      }
    }
    return {
      ok: false,
      delivery: 'missing',
      evidence: 'none',
      message: '已点击发送，但会话里没有确认到这条回复 —— 按未发送处理（不重试，避免重复发送）。',
    }
  }

  /**
   * 探测某个岗位当前的接触阶段（§ `ContactStage`）。
   *
   * 判据全部来自**已实测**的收件箱选择器（2026-09-18）：
   *   * 会话列表里没有这个岗位的行 → `null`（**不返回 `none`**：分不清"从没打过招呼"
   *     和"平台已把会话移出保留窗口"，猜一个会比不报更糟）；
   *   * 行存在 + 最后一条是 HR 发的（或带未读）→ `replied`；
   *   * 行存在 + 最后一条是我发的 + `.message-status` 是 `status-read` → `read`；
   *   * 行存在 + 最后一条是我发的 + `status-delivery` → `delivered`；
   *   * 状态类名认不出来 → `null`（带原因，不猜）。
   *
   * ⚠️ `read` 这一档**代码支持但尚未实测**：目前唯一那条会话里我的消息还是 `status-delivery`，
   *   没等到被已读的样本。`interview_scheduled` 不在这里判 —— 那是 domain 的邀约识别职责。
   */
  const detectStage = async (
    page: PageLike,
    job: { title: string; company: string; sourceUrl: string },
  ): Promise<ContactStage | null> => {
    await page.goto(config.chatUrl)
    await waitFor(page, config.inboxSelectors.row, config.actionWaitMs)
    // 只读动作也要判墙：会话页被登录墙/验证码顶掉时，"找不到那一行"会被
    // 误读成"这个岗位从没接触过"（`null` 本身是合法返回值，正好掩盖了真相）。
    await assertActionPage(page)
    const probe = await page.evaluate(detectStageInPage, {
      selectors: config.inboxSelectors,
      company: job.company,
      title: job.title,
    })
    // 判不出来就 return null（契约允许），**不猜**：`none` 会被上层当成"没接触过"记下来，
    // 而"会话超出平台保留窗口"与"从没打过招呼"是两件事。
    return probe.stage
  }

  /**
   * 收件箱：读会话列表（HR 消息）。
   *
   * 这是纯读动作 —— 只要页面能打开就能做，不需要 CDP 输入面。
   * ⚠️ 未登录会停在登录墙，此时**选择器找不到容器 → 抛错**（而不是返回空数组）；
   * 「0 条」只会在"容器在、列表空"时出现，那样的 0 条才可信。
   */
  const readInbox = async (page: PageLike): Promise<RawInboxMessage[]> => {
    await page.goto(config.chatUrl)
    // 等**容器**而不是等行：空列表时容器在、行不在。等行会把"真的空"拖成一次超时，
    // 而超时后返回的 [] 又和"选择器腐烂"的 [] 长得一模一样 —— 0 条的可信度就没了。
    await waitFor(
      page,
      config.inboxSelectors.listContainer !== ''
        ? config.inboxSelectors.listContainer
        : config.inboxSelectors.row,
      config.actionWaitMs,
    )
    // 先判墙再动手（包括切 tab）：墙页上切 tab 毫无意义，还会多留下一次点击
    await assertActionPage(page)
    // 按 `inboxTab` 收窄（默认 all）：纯精度优化 —— 切不过去时读到的是当前展示的全量，
    // 那是**超集**，不会漏；所以这里点不上也不报错、不改变语义。
    if (config.inboxTab !== 'all') {
      const label = INBOX_TAB_LABELS[config.inboxTab]
      if ((await clickSelector(page, config.inboxSelectors.tabItem, label)) !== null) {
        await page.waitForTimeout(1_000)
      }
    }
    // 容器缺失时 readInboxInPage 会**抛错**（带选择器名），由 guard 如实转述，不谎报 0 条
    return await page.evaluate(readInboxInPage, { selectors: config.inboxSelectors })
  }

  /**
   * 附件投递（发简历）。
   *
   * 2026-09-18 真实会话实测把这条路看得比较清楚了，两点都推翻/修正了先前基于 BossHunter 的判断：
   *
   *   ① **会话里没有"把本地文件发给 HR"的入口**。页面上确实有 `input[type=file]`，但只有两个：
   *      `.upload-resume-dialog` 里的是「上传附件简历」**到你自己简历库**，
   *      `.btn-sendimg` 里的是**发图片**。拿它们冒充投递会把附件传错地方/发成图片 ——
   *      所以 `filePath ≠ null` 时**直接 fail-closed**，不假装成功。
   *   ② **「发简历」要等对方回复**。工具条按钮 `.toolbar-btn` 文案「发简历」，
   *      未回复时带 `unable` 且 `aria-label="求简历：双方回复后可用"`。这条要如实转述，
   *      否则用户会以为"投了但 HR 没理我"。
   *
   * 尚缺实测的一环：平台简历选择弹窗（`.choose-resume-dialog`）的结构 ——
   * 本次会话「发简历」不可用，弹窗没机会打开。
   */
  const sendResume = async (
    page: PageLike,
    job: { title: string; company: string; sourceUrl: string },
    filePath: string | null,
  ): Promise<ActionResult> => {
    if (page.mouse === undefined) return missingInputSurface()

    // ── 路径一：本地文件 —— 平台没有这个入口，绝不假装发出去了 ──────────
    if (filePath !== null) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message:
          'BOSS 求职者端的会话里没有「把本地简历文件发给 HR」的入口（实测只有两个 file input：' +
          '「上传附件简历」到我的简历、以及「发送图片」）。请改用平台内简历投递（filePath 传 null），' +
          '或先在「我的简历」里上传附件简历再由 HR 侧查看。',
      }
    }

    // ── 路径二：平台内简历（工具条「发简历」）────────────────────────────
    if (!(await openConversation(page, job))) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message: `没能在会话列表里找到「${job.company === '' ? job.title : job.company}」的会话，未发简历。`,
      }
    }

    await assertActionPage(page)
    // 发简历比回复重得多：对方会真收到一份简历卡片，而且平台侧**不可撤回**。
    // 停留给到 8–16s（配置 `dwellBeforeResumeMs`），别把"点两下"做成机械连击。
    await dwell(page, config.dwellBeforeResumeMs)

    // 先读按钮状态：不可用时点它毫无反应，那种"没反应"最容易被误读成投递成功
    const button = await page.evaluate(toolbarButtonStateInPage, {
      selector: config.chatSelectors.resumeButton,
      textIncludes: '简历',
      disabledClass: config.chatSelectors.resumeButtonDisabledClass,
    })
    if (!button.found) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message: '会话工具条里找不到「发简历」按钮（选择器可能已变，或该会话没有工具条）。',
      }
    }
    if (button.disabled) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message:
          `「发简历」当前**不可用**${button.reason === '' ? '' : `（平台提示：${button.reason}）`} —— ` +
          'BOSS 要求**双方回复之后**才能发简历。请等 HR 回复后再投，不要反复点。',
      }
    }

    if ((await clickSelector(page, config.chatSelectors.resumeButton, '简历')) === null) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message: '「发简历」按钮可见但坐标定位失败，未点击。',
      }
    }
    if (!(await waitFor(page, config.chatSelectors.resumeDialog, config.actionWaitMs))) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message: '点了「发简历」但没有出现简历选择弹窗（该弹窗结构尚未实测，选择器可能已变）。',
      }
    }
    if ((await clickSelector(page, config.chatSelectors.resumeDialogItem)) === null) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message: '简历选择弹窗里没有可选项（平台里可能还没有可用简历）。',
      }
    }
    if ((await clickSelector(page, config.chatSelectors.resumeDialogConfirm)) === null) {
      return {
        ok: false,
        delivery: 'missing',
        evidence: 'none',
        message: '已选中简历，但点不到弹窗的确认按钮。',
      }
    }
    const visible = await waitFor(page, config.chatSelectors.resumeCard, config.actionWaitMs)
    if (visible) return { ok: true, delivery: 'delivered', evidence: 'dom' }
    return {
      ok: false,
      delivery: 'pending',
      evidence: 'none',
      message: '已在平台弹窗里确认发送简历，但会话里还没出现简历卡片，未能确认送达。',
    }
  }

  return { sayHello, reply, detectStage, readInbox, sendResume }
}
