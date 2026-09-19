/**
 * 智联**未登录**（游客）行为探针 —— 只读，用来钉住 `authRequirement` 那三个事实。
 *
 * ## 它回答的问题（E）
 *
 * `platform-facts.ts` 里 zhaopin 写的是 `{ crawl: 'none', detail: 'required', actions: 'required' }`，
 * 而 `PLATFORM-ZHAOPIN.md` §8.1 记的是"**未登录即可访问** `/jobdetail/{id}.htm` 拿 JD 全文"。
 * 两处矛盾，而"要不要登录"是给用户看的事实（采集页按它渲染"登录要求"）—— 不能用猜的定谳。
 * 现有夹具（`test/fixtures/zhaopin-detail.html`）是**合成**的（2 KB），证明不了线上未登录会怎样。
 *
 * 所以这里用一个**全新 profile**（默认 `.probe-zhaopin-anon-profile`，从不登录）真跑一遍，
 * 逐项记录：会不会被 302 到地区页/登录页、载荷有没有 `jobDetail`、DOM 的 JD 和薪资各是什么样、
 * 投递入口在不在。结论直接对应 `crawl` / `detail` / `actions` 三个格子。
 *
 * ## 用法
 *
 * ```bash
 * npm run probe:zhaopin-anon
 * ```
 *
 * 环境变量：
 *   ZHAOPIN_ANON_PROFILE   profile 目录（默认 `.probe-zhaopin-anon-profile`）
 *   ZHAOPIN_JOB_URL        指定详情页（默认取搜索结果第一条；取不到则用夹具里那个岗位）
 *
 * ## 产物
 *
 * `.probe-zhaopin-anon-capture/zhaopin-anon-report.json` + 每页一份 HTML。
 * ⚠️ 与其它探针一致：**刻意不写 `test/fixtures/`**（那里是被用例硬编码钉住的夹具）。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Page } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'

const PROFILE = process.env['ZHAOPIN_ANON_PROFILE'] ?? join(process.cwd(), '.probe-zhaopin-anon-profile')
const CAPTURE_DIR = join(process.cwd(), '.probe-zhaopin-anon-capture')
const SEARCH_URL = 'https://www.zhaopin.com/sou/jl765'
const FALLBACK_JOB_URL = 'https://www.zhaopin.com/jobdetail/CC320762410J40890686210.htm'

/** 一页观察到的东西（自包含）。 */
export function inspectAnonPageInPage(): {
  url: string
  title: string
  hasInitialState: boolean
  /** 载荷里 `jobDetail.detailedPosition.description` 的长度（0 = 没有）。 */
  payloadJdLength: number
  /** 载荷里的薪资原值。 */
  payloadSalary: string
  /** DOM 里 JD 正文的长度。 */
  domJdLength: number
  /** DOM 上显示的薪资（未登录时可能是掩码 `**-**元`）。 */
  domSalary: string
  /** 投递入口（`.summary-planes__action`）在不在。 */
  hasApplyEntry: boolean
  /** 沟通入口（`.summary-planes__prechat`）在不在。 */
  hasChatEntry: boolean
  /** 看见"要登录"的痕迹没有。 */
  loginHint: string
} {
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : value.replace(/\s+/g, ' ').trim()
  const textOf = (selector: string): string => {
    try {
      const node = document.querySelector(selector)
      return node === null ? '' : clean(node.textContent)
    } catch {
      return ''
    }
  }
  const existsInDom = (selector: string): boolean => {
    try {
      return document.querySelector(selector) !== null
    } catch {
      return false
    }
  }

  // 载荷：智联把首屏数据挂在 `__INITIAL_STATE__` 上（列表/详情同一套）
  let payloadJdLength = 0
  let payloadSalary = ''
  let hasInitialState = false
  try {
    const raw = (globalThis as unknown as { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__
    hasInitialState = raw !== undefined && raw !== null
    const state = (raw ?? {}) as Record<string, unknown>
    const detail = (state['jobDetail'] ?? {}) as Record<string, unknown>
    const detailed = (detail['detailedPosition'] ?? {}) as Record<string, unknown>
    payloadJdLength = clean(typeof detailed['description'] === 'string' ? detailed['description'] : '').length
    payloadSalary =
      typeof detail['salary'] === 'string' ? detail['salary'] : typeof detail['salary60'] === 'string' ? detail['salary60'] : ''
  } catch {
    /* 忽略：载荷读不到也是一种结论 */
  }

  const bodyText = clean(document.body === null ? '' : document.body.textContent).slice(0, 4000)
  const loginWords = ['立即登录', '登录后查看', '请先登录', '登录/注册']
  const hit = loginWords.find((word) => bodyText.includes(word)) ?? ''

  return {
    url: location.href,
    title: document.title,
    hasInitialState,
    payloadJdLength,
    payloadSalary,
    domJdLength: textOf('.describtion-card__detail-content').length,
    domSalary: textOf('.summary-planes__salary'),
    hasApplyEntry: existsInDom('.summary-planes__action'),
    hasChatEntry: existsInDom('.summary-planes__prechat'),
    loginHint: hit,
  }
}

/** 在页面里找第一条真实岗位详情链接（自包含）。 */
export function firstJobHrefInPage(): string {
  try {
    for (const a of Array.from(document.querySelectorAll("a[href*='/jobdetail/']"))) {
      const href = a.getAttribute('href') ?? ''
      if (!/jobdetail\/[A-Za-z0-9]+\.htm/.test(href)) continue
      return href.startsWith('http') ? href : `https://www.zhaopin.com/${href.replace(/^\//, '')}`
    }
  } catch {
    /* ignore */
  }
  return ''
}

type Snap = Awaited<ReturnType<typeof inspectAnonPageInPage>>

async function capture(page: Page, name: string, report: Snap[]): Promise<void> {
  const snap = await page.evaluate(inspectAnonPageInPage).catch(() => null)
  if (snap === null) return
  report.push(snap)
  mkdirSync(CAPTURE_DIR, { recursive: true })
  const html = await page.content().catch(() => '')
  if (html !== '') writeFileSync(join(CAPTURE_DIR, `${name}.html`), html, 'utf8')
  console.log(
    `\n[${name}] ${snap.url.slice(0, 100)}\n` +
      `  title=${snap.title.slice(0, 60)}\n` +
      `  载荷：INITIAL_STATE=${String(snap.hasInitialState)} · JD ${String(snap.payloadJdLength)} 字 · 薪资「${snap.payloadSalary}」\n` +
      `  DOM：JD ${String(snap.domJdLength)} 字 · 薪资「${snap.domSalary}」· 投递入口=${String(snap.hasApplyEntry)} · 沟通入口=${String(snap.hasChatEntry)}\n` +
      `  登录痕迹：${snap.loginHint === '' ? '(无)' : snap.loginHint}`,
  )
}

async function main(): Promise<void> {
  const executable = discoverExecutable(candidateExecutables())
  if (executable === null) throw new Error('找不到 Chrome/Chromium 可执行文件')
  console.log('── 智联未登录（游客）行为探针 ──')
  console.log(`profile（从不登录）：${PROFILE}`)
  console.log('⚠️ 全程只读：不点任何按钮、不投递、不发消息。')

  const context = await chromium.launchPersistentContext(PROFILE, {
    executablePath: executable,
    headless: false,
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    args: ['--disable-blink-features=AutomationControlled'],
  })
  try {
    await context.addInitScript({ content: STEALTH_INIT_SCRIPT })
    const page = context.pages()[0] ?? (await context.newPage())
    const report: Snap[] = []

    // ① 列表页：`crawl` 那一格
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
    await page.waitForTimeout(8_000)
    await capture(page, 'anon-01-search', report)

    // 取一条真实岗位链接（取不到就用夹具里那个岗位）
    const href = await page.evaluate(firstJobHrefInPage).catch(() => '')
    const jobUrl = process.env['ZHAOPIN_JOB_URL'] ?? (href !== '' ? href : FALLBACK_JOB_URL)

    // ② 详情页：`detail` 那一格
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
    await page.waitForTimeout(10_000)
    await capture(page, 'anon-02-detail', report)

    // ③ 会话页：`actions` 那一格（未登录应当被弹去登录）
    await page.goto('https://i.zhaopin.com/im', { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
    await page.waitForTimeout(10_000)
    await capture(page, 'anon-03-im', report)

    mkdirSync(CAPTURE_DIR, { recursive: true })
    const reportPath = join(CAPTURE_DIR, 'zhaopin-anon-report.json')
    writeFileSync(
      reportPath,
      JSON.stringify({ capturedAt: new Date().toISOString(), profile: PROFILE, jobUrl, snapshots: report }, null, 2),
      'utf8',
    )

    // ── 结论：直接对 `authRequirement` 那三格给判断依据 ──
    const search = report.find((item) => item.url.includes('/sou/') || item.url.includes('/jobs'))
    const detail = report[1]
    const im = report[2]
    console.log('\n════ 结论（未登录）════')
    console.log(
      `crawl  ：${search === undefined ? '没采到' : search.payloadJdLength + search.domJdLength > 0 || search.title !== '' ? '列表页有渲染（看 anon-01 的卡片数）' : '空'}`,
    )
    console.log(
      `detail ：载荷 JD ${String(detail?.payloadJdLength ?? -1)} 字 / DOM JD ${String(detail?.domJdLength ?? -1)} 字 · ` +
        `载荷薪资「${detail?.payloadSalary ?? ''}」/ DOM 薪资「${detail?.domSalary ?? ''}」· ` +
        `最终 URL ${detail?.url.slice(0, 90) ?? ''}`,
    )
    console.log(
      `actions：投递入口=${String(detail?.hasApplyEntry ?? false)} · 沟通入口=${String(detail?.hasChatEntry ?? false)} · ` +
        `会话页最终 URL ${im?.url.slice(0, 90) ?? ''} · 登录痕迹「${im?.loginHint ?? ''}」`,
    )
    console.log(`\n报告已保存：${reportPath}`)
  } finally {
    await context.close().catch(() => undefined)
  }
}

await main()
