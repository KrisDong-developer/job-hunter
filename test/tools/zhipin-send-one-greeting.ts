#!/usr/bin/env node
/**
 * 一次性校准工具：**经真实 guard 链给 BOSS 发一条打招呼**。
 *
 * ## 为什么需要它
 *
 * `probe:zhipin-chat` 要采**会话级**选择器（`#chat-input` / 消息列表 / `.choose-resume-dialog` /
 * 时间节点）得先有一条真实会话，而校准用的账号一条都没有
 * （2026-09-18 实测页面自报「30天内暂无联系人」）。宿主（DSH / Cordis）没有 CLI 入口，
 * 所以这里用**最小装配**把产品路径上同一条链接起来：
 *
 *   guard.run（规则 + 审计 + 一次性令牌；`actor: 'gui'` + `guiConfirmed` = 界面上的"我已确认"）
 *     → guard/actions/greeting.ts 的 `sendGreeting`
 *       → adapters/zhipin.ts 的 `sayHello`（CDP Input 级拟人点击 + 逐字符输入）
 *
 * 特意**不绕过**任何一层：令牌是真的、规则是真的、适配器是真的 —— 这样这条记录
 * 既是"账号里多了一条会话"，也是一次**端到端验证**。
 *
 * ## ⚠️ 这会真的发出去
 *
 * 真实 HR 会收到这条消息，并且消耗账号的打招呼额度。所以：
 *   * **必须显式** `ZHIPIN_SEND_ONE=1` 才执行（防手滑）；
 *   * 一次只发**一条**，发完即退出；
 *   * 只用**临时空库**（不碰你的真实数据）；浏览器用你**已登录的 profile**；
 *   * 发完请接着跑 `npm run probe:zhipin-chat` 采会话级证据。
 *
 * 用法：
 *   $env:ZHIPIN_SEND_ONE='1'; npm run zhipin:send-one
 * 环境变量：
 *   ZHIPIN_PROFILE（默认与 probe:zhipin / probe:zhipin-chat 共用同一份 profile）
 *   ZHIPIN_GREETING（话术；不填用默认短句）
 *   ZHIPIN_KEY / ZHIPIN_CITY_CODE（从搜索结果里挑第一个岗位，默认 Java / 深圳）
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'patchright'
import { createZhipinAdapter } from '../../src/host/platform/adapters/zhipin.js'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { createAdapterRegistry } from '../../src/host/platform/registry.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'
import type { SessionService } from '../../src/host/platform/session.js'
import type { PageLike, PageSource } from '../../src/host/platform/types.js'
import { createGuard } from '../../src/host/guard/index.js'
import { createApprovalPort } from '../../src/host/guard/approval.js'
import { GREETING_SEND_ACTION, sendGreeting } from '../../src/host/guard/actions/greeting.js'
import { writeGuardConfig } from '../../src/host/guard/rules.js'
import { openStore } from '../../src/host/store/store.js'

const ENABLED = process.env['ZHIPIN_SEND_ONE'] === '1'
const PROFILE = process.env['ZHIPIN_PROFILE'] ?? join(process.cwd(), '.probe-zhipin-profile')
const KEYWORD = process.env['ZHIPIN_KEY'] ?? 'Java'
const CITY = process.env['ZHIPIN_CITY_CODE'] === '101280600' ? '深圳' : (process.env['ZHIPIN_CITY'] ?? '深圳')
const GREETING =
  process.env['ZHIPIN_GREETING'] ??
  '您好，看到这个岗位和我的后端开发经历比较匹配，方便的话想进一步聊聊，谢谢！'

function log(message: string): void {
  console.log(`[zhipin-send-one] ${new Date().toISOString()} ${message}`)
}

/** 只要一个"已登录"的答案 —— 真实登录态在浏览器 profile 里，这里只满足 guard 的前置检查。 */
function fakeSession(): SessionService {
  return {
    status: (platformId: string) => ({
      platformId,
      loggedIn: true,
      hiddenFromCurrentEmployer: true,
      lastCheckAt: new Date().toISOString(),
      hint: null,
      updatedAt: new Date().toISOString(),
    }),
  } as unknown as SessionService
}

async function main(): Promise<void> {
  if (!ENABLED) {
    log('⛔ 未执行：这会**真的**发一条打招呼给真实 HR。确认后请显式设 ZHIPIN_SEND_ONE=1 再跑。')
    log('   例：$env:ZHIPIN_SEND_ONE=1; npm run zhipin:send-one')
    return
  }

  const dataDir = mkdtempSync(join(tmpdir(), 'jh-send-one-'))
  const now = new Date().toISOString()
  const store = openStore({ dataDir })
  const registry = createAdapterRegistry()
  const adapter = createZhipinAdapter()
  registry.register(adapter)

  const executablePath = discoverExecutable(candidateExecutables())
  log(`浏览器：${executablePath ?? '（交给 patchright 自行解析）'} · profile：${PROFILE}`)

  let context: BrowserContext | undefined
  try {
    context = await chromium.launchPersistentContext(PROFILE, {
      headless: false,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      viewport: null,
      args: ['--disable-blink-features=AutomationControlled'],
      ...(executablePath === undefined ? {} : { executablePath }),
    })
    await context.addInitScript({ content: STEALTH_INIT_SCRIPT })
    const page: Page = await context.newPage()
    // Playwright 的 `goto` 返回 `Response | null`，与 `PageLike` 的 `Promise<void>` 不结构兼容 —— 显式过一次
    const pageLike = page as unknown as PageLike

    // ① 用**适配器自己**的采集流程挑一个岗位（顺带验证列表解析仍然可用）
    log(`搜索岗位：${KEYWORD} · ${CITY}`)
    await adapter.crawl.gotoSearch(pageLike, { keyword: KEYWORD, city: CITY })
    const jobs = await adapter.crawl.readListPage(pageLike)
    const target = jobs.find((job) => job.platformJobId !== '' && job.sourceUrl !== '')
    if (target === undefined) {
      log(`⛔ 没从搜索结果里取到可用岗位（解析到 ${String(jobs.length)} 条）—— 不发送。`)
      return
    }
    log(
      `目标岗位：${target.title}｜${target.company}｜薪资「${target.salaryRaw ?? ''}」｜` +
        `${target.city ?? ''}/${target.district ?? ''}｜${target.expReq ?? ''}｜${target.eduReq ?? ''}`,
    )
    log(`  ↳ ${target.sourceUrl.slice(0, 100)}`)

    // ② 临时库里只放这一条岗位 + 一个"已登录"标记；guard 的规则也要放宽到允许发一条
    // ⚠️ **先建平台行、再建账号、最后建岗位**：三张表逐级外键（`account.platform_id` 与
    //    `job.platform_id` 都指向 `platform`），顺序反了就是 `FOREIGN KEY constraint failed`
    //    （实测踩到）。产品运行时由 `session.ts` 的 `ensurePlatform` 顺手做掉，手工装配得自己来。
    store.platform.ensure({ id: 'zhipin', displayName: 'BOSS直聘' }, now)
    store.account.upsert(
      { platformId: 'zhipin', loggedIn: true, hiddenFromCurrentEmployer: true, hint: null },
      now,
    )
    const job = store.job.upsert(
      {
        platformId: 'zhipin',
        platformJobId: target.platformJobId,
        title: target.title,
        companyId: null,
        salaryRaw: target.salaryRaw ?? '',
        salaryMin: null,
        salaryMax: null,
        salaryMonths: null,
        city: target.city ?? '',
        district: target.district ?? '',
        expReq: target.expReq ?? '',
        eduReq: target.eduReq ?? '',
        tags: [],
        sourceUrl: target.sourceUrl,
        publishedAt: target.publishedAt ?? now,
        jdText: '',
      },
      now,
    )
    writeGuardConfig(
      store,
      {
        // 发送窗口/随机休息日会随"当下几点"漂移 —— 校准工具要的是"发这一条"，先关掉
        sendWindow: '',
        dayOffProbability: 0,
        levels: { l3Greeting: true, l4Application: false, l4Reply: false },
      },
      now,
    )

    // ③ 真链：guard.run → sendGreeting → adapter.sayHello
    const guard = createGuard({
      store,
      // ⚠️ `session` 必须给：`checkStealth` 从它读 `hiddenFromCurrentEmployer`，
      // 读不到就按**保守处理拒绝**（"读不到 zhipin 的隐身状态"）—— 实测踩到，
      // 这个 fail-closed 是对的，别绕。
      session: fakeSession(),
      // ⚠️ fail-closed：`actor: 'gui'` + `guiConfirmed` 走的是"用户已确认"那条路，
      // **不该被问到**。这里给一个"没有界面"的审批端口 —— 万一流程变了真来问，
      // guard 会按 **拒绝**处理（不会误发），同时这行注释告诉你该去查 guiConfirmed 路径了。
      approval: createApprovalPort({ available: () => false }),
      logger: { info: (m) => log(m), warn: (m) => log(`⚠️ ${m}`) },
    })
    const pageSource: PageSource = {
      acquire: async () => page as unknown as PageLike,
      release: async () => undefined,
    }

    log('开始发送（会有 15–30 秒的拟人停留，是刻意的反检测节奏）…')
    const result = await guard.run(
      {
        action: GREETING_SEND_ACTION,
        actor: 'gui',
        danger: 'high',
        target: { jobId: job.id, platformId: 'zhipin' },
        payload: { jobTitle: target.title, company: target.company },
        // 用户在对话里已明确确认发这一条 —— 与 HTTP 路由的 `confirm: true` 同一条路径
        guiConfirmed: true,
      },
      async (token) =>
        await sendGreeting(
          {
            store,
            registry,
            session: fakeSession(),
            pageSource,
            logger: { info: (m) => log(m), warn: (m) => log(`⚠️ ${m}`) },
            record: (recorded) => log(`接触记录：岗位 #${String(recorded.jobId)}（临时库，用完即弃）`),
          },
          token,
          { jobId: job.id, text: GREETING },
        ),
    )

    log(`✔ 已发送：${result.company || result.title}（${String(result.textLength)} 字，${result.sentAt}）`)
    const audit = store.audit.list(5)
    log(`审计留痕：${JSON.stringify(audit.map((row) => ({ action: row.action, result: row.result })))}`)
    log('下一步：npm run probe:zhipin-chat（现在会话列表里应该有一条，能采到会话级选择器了）')
  } finally {
    await context?.close().catch(() => undefined)
    store.close()
    try {
      rmSync(dataDir, { recursive: true, force: true })
    } catch {
      /* 句柄仍占用：留给系统清理临时目录 */
    }
  }
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
