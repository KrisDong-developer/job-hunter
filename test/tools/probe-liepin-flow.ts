#!/usr/bin/env node
/**
 * 猎聘探针 —— v4：模拟真人操作流（首页 → 搜索框输入 → 点搜索 → 列表页）。
 *
 * 验证一个猜想：前几轮全是 `page.goto` **直达列表页 URL**，都被 about:blank。
 * 而真人是从首页一步步点进去的。如果猎聘区分「直达」与「真人交互流」，
 * 那么从首页输入关键词点搜索进入的列表页应该能活下来。
 *
 * 环境：playwright 管道连接（**不开放调试端口**）+ webdriver 反检测。
 * 这是与插件真实运行环境一致的组合。
 *
 * 用法：node scripts/run-ts.mjs test/tools/probe-liepin-flow.ts
 */
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import type { BrowserContext, Page } from 'playwright-core'

const ROOT = process.cwd()
const PROFILE_DIR = join(ROOT, '.probe-liepin-profile')
const HOME_URL = 'https://www.liepin.com/'

const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] });
`

function log(message: string): void {
  console.log(`[probe-liepin-flow] ${new Date().toISOString()} ${message}`)
}

async function cleanStaleLocks(dir: string): Promise<void> {
  const { rmSync } = await import('node:fs')
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']) {
    try {
      rmSync(join(dir, name), { force: true })
    } catch {
      /* ignore */
    }
  }
}

function attachDiagnostics(page: Page, label: string): void {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      log(`  [${label}] console.error: ${message.text().slice(0, 200)}`)
    }
  })
  page.on('pageerror', (error) => {
    log(`  [${label}] pageerror: ${String(error).slice(0, 300)}`)
  })
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      log(`  [${label}] navigated → ${frame.url()}`)
    }
  })
}

/** 读页面关键信息（列表卡数量、是否约空、URL）。 */
async function pageState(page: Page, tag: string): Promise<void> {
  const url = page.url()
  log(`  [${tag}] URL: ${url}`)
  if (url === 'about:blank' || url.startsWith('about:')) {
    log(`  [${tag}] ⚠️ 被风控替换成 about:blank`)
    return
  }
  const data = await page.evaluate(() => {
    const text = (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const cardSelectors = [
      '.job-card',
      '.job-card-pc-container',
      '.job-detail-card',
      '.position-card',
      '.job-card-wrapper',
      '.job-list-item',
      '.job-card-box',
      '.job-detail-box',
      '.job-card-item',
      '.resume-card',
    ]
    const hits: Record<string, number> = {}
    for (const selector of cardSelectors) {
      try {
        const count = document.querySelectorAll(selector).length
        if (count > 0) hits[selector] = count
      } catch {
        /* ignore */
      }
    }
    // 搜索框定位线索
    const inputs: string[] = []
    for (const input of Array.from(document.querySelectorAll('input')).slice(0, 10)) {
      const el = input as HTMLInputElement
      const placeholder = el.getAttribute('placeholder') ?? ''
      const cls = el.className ?? ''
      const id = el.id ?? ''
      inputs.push(`input{p="${placeholder}" class="${String(cls).slice(0, 40)}" id="${id}"}`)
    }
    return JSON.stringify({
      title: document.title ?? '',
      bodyLength: text.length,
      bodyHead: text.slice(0, 200),
      cardHits: hits,
      inputs,
    })
  })
  log(`  [${tag}] ${data}`)
}

async function main(): Promise<void> {
  mkdirSync(PROFILE_DIR, { recursive: true })
  await cleanStaleLocks(PROFILE_DIR)

  const executablePath = [
    process.env['ProgramFiles'] ? join(process.env['ProgramFiles'], 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
    process.env['ProgramFiles(x86)'] ? join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
    process.env['ProgramFiles'] ? join(process.env['ProgramFiles'], 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
  ].find((path) => path !== '' && existsSync(path)) ?? ''

  const launchOptions = {
    headless: false,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled'],
  }

  log(`使用浏览器：${executablePath === '' ? 'playwright 默认' : executablePath}`)
  const context: BrowserContext = await chromium.launchPersistentContext(PROFILE_DIR, {
    ...launchOptions,
    ...(executablePath === '' ? {} : { executablePath }),
  })
  await context.addInitScript({ content: STEALTH_SCRIPT })

  try {
    const page = context.pages()[0] ?? (await context.newPage())
    attachDiagnostics(page, 'main')

    // ── 步骤 1：打开首页 ──
    log('==== 步骤 1：打开首页 ====')
    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForTimeout(3_000)
    await pageState(page, '首页')

    // ── 步骤 2：找搜索框，输入关键词 ──
    log('==== 步骤 2：定位搜索框 ====')
    const searchBox = page.locator(
      'input[placeholder*="搜索"], input[placeholder*="职位"], input[placeholder*="公司"], .search-form input, .header-search input, input[name="key"], input[class*="search"]',
    ).first()
    const count = await searchBox.count()
    log(`  搜索框候选命中数：${count}`)
    if (count === 0) {
      log('  没找到搜索框，改用 evaluate 探查 DOM')
      const probe = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input')).map((el) => {
          const input = el as HTMLInputElement
          return {
            placeholder: input.getAttribute('placeholder') ?? '',
            type: input.type,
            id: input.id,
            cls: String(input.className).slice(0, 60),
            name: input.name,
          }
        })
        return JSON.stringify(inputs)
      })
      log(`  inputs: ${probe}`)
      await page.waitForTimeout(5_000)
      await pageState(page, '探查后')
      return
    }

    await searchBox.click()
    await page.waitForTimeout(500)
    await searchBox.fill('Java')
    log('  已输入 Java')
    await page.waitForTimeout(500)

    // ── 步骤 3：按回车 / 点搜索按钮 ──
    log('==== 步骤 3：提交搜索 ====')
    await searchBox.press('Enter')
    await page.waitForTimeout(4_000)
    await pageState(page, '搜索后-Enter')

    // 若 Enter 没跳转，尝试点搜索按钮
    const afterEnter = page.url()
    if (afterEnter === HOME_URL || afterEnter.startsWith(HOME_URL) && !afterEnter.includes('zhaopin')) {
      log('  Enter 未进入列表页，尝试点搜索按钮')
      const submit = page.locator(
        'button[class*="search"], .search-form button, button[type="submit"], [class*="search-btn"]',
      ).first()
      const submitCount = await submit.count()
      if (submitCount > 0) {
        await submit.click()
        await page.waitForTimeout(4_000)
        await pageState(page, '搜索后-点按钮')
      }
    }
  } finally {
    log('done（保留窗口供目视确认，30 秒后关闭）')
    await new Promise((resolve) => setTimeout(resolve, 30_000))
    await context.close().catch(() => undefined)
  }
}

void main()
