import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  createLiepinAdapter,
  DEFAULT_LIEPIN_CONFIG,
  extractJobDetailInPage,
} from '../../src/host/platform/adapters/liepin.js'
import type { PageLike } from '../../src/host/platform/types.js'

/**
 * 猎聘详情页解析（JD 抓取）。
 *
 * 猎聘的**列表接口与列表 DOM 都不含 JD**（采样逐键确认），JD 只能逐条进详情页 ——
 * 所以这一段是"猎聘岗位能不能参与打分/标注"的前提。
 *
 * 夹具由探针 `LIEPIN_DETAIL=1 npm run probe:liepin` 保存（真实详情页，SSR 直出）。
 * 没有夹具时跳过：这条测试的价值全在"对着真实页面校准过"上，用合成样本自欺没有意义。
 */

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'liepin-detail.html')

/** 把静态 HTML 包成 `PageLike`（evaluate 时把 jsdom 的 document 挂到全局）。 */
function pageOf(html: string, url: string): PageLike {
  const dom = new JSDOM(html, { url })
  return {
    url: () => url,
    goto: async () => undefined,
    waitForTimeout: async () => undefined,
    async evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R> {
      const globals = globalThis as { document?: unknown; window?: unknown; location?: unknown }
      const previous = { document: globals.document, window: globals.window, location: globals.location }
      globals.document = dom.window.document
      globals.window = dom.window
      globals.location = dom.window.location
      try {
        return await Promise.resolve(fn(arg))
      } finally {
        globals.document = previous.document
        globals.window = previous.window
        globals.location = previous.location
      }
    },
  }
}

test('详情页解析：JD 正文 / 标题 / 薪资 / 城市 / 公司名（真实夹具）', async (t) => {
  if (!existsSync(FIXTURE)) {
    t.skip(`详情夹具不存在（${FIXTURE}）—— 先跑 LIEPIN_DETAIL=1 npm run probe:liepin`)
    return
  }
  const html = readFileSync(FIXTURE, 'utf8')
  const url = 'https://www.liepin.com/job/1984775119.shtml'
  const adapter = createLiepinAdapter()
  assert.ok(adapter.detail !== undefined, '适配器必须声明 detail（否则 JD 永远抓不到）')

  const detail = await adapter.detail.extract(pageOf(html, url))

  // JD 正文：这是本功能存在的理由，必须非空且足够长
  assert.ok(detail.jdText !== undefined && detail.jdText !== null, 'JD 必须解析出来')
  assert.ok(detail.jdText.length > 200, `JD 太短，可能锚错了块（实际 ${String(detail.jdText.length)} 字）`)
  assert.ok(!detail.jdText.includes('语言要求'), '不能把「其他信息」那块（ellipsis-1）当成 JD')

  // 页面本体就暴露的字段
  assert.equal(detail.title, 'Java工程师')
  assert.equal(detail.salaryRaw, '15-30k·14薪')
  assert.equal(detail.city, '佛山-顺德区')
  assert.equal(detail.company, '库卡机器人')
  assert.equal(detail.expReq, '5年以上')
  assert.equal(detail.eduReq, '本科')
  // 没锚中的字段不许编
  assert.equal(detail.notes, undefined, `不该有校准警告：${JSON.stringify(detail.notes)}`)
})

test('详情页解析：选择器被改坏时如实留 notes、不编 JD（降级路径）', async (t) => {
  if (!existsSync(FIXTURE)) {
    t.skip('详情夹具不存在')
    return
  }
  const html = readFileSync(FIXTURE, 'utf8')
  const broken = {
    ...DEFAULT_LIEPIN_CONFIG.selectors,
    detailIntroSection: 'section.does-not-exist',
    detailTitle: '.does-not-exist',
  }
  const detail = await pageOf(html, 'https://www.liepin.com/job/1.shtml').evaluate(extractJobDetailInPage, {
    selectors: broken,
    expPattern: DEFAULT_LIEPIN_CONFIG.expPattern,
    eduPattern: DEFAULT_LIEPIN_CONFIG.eduPattern,
  })
  assert.equal(detail.jdText, undefined, '锚不中就不给 JD（宁可降级，不编一份）')
  assert.ok((detail.notes ?? []).length >= 2, '要留下可读的校准提示')
})
