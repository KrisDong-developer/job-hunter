#!/usr/bin/env node
/**
 * 神仙外企（waiqi.com）探针 —— 真实在线验证器。
 *
 * 用途：对 `src/host/platform/adapters/waiqi-job.ts` 里的每一条「实测」断言
 * 做一次在线复核，并探查是否有可新增/可修正的点。
 * 列表接口**匿名可读**（不需要登录 / 不需要浏览器），所以直接走 HTTP 即可。
 *
 * 用法：npm run probe:waiqi   （可选 WAIQI_KEY='Java' WAIQI_CITY_ID=248）
 * 反馈：只会把断言编成 PASS / FAIL，跑完一眼看清哪条需要改适配器。
 *
 * 注意：只做**只读**探针，不改任何线上数据；请求之间带少量延时以示礼貌。
 */
import { setTimeout as sleep } from 'node:timers/promises'

const API = 'https://backservice.offerxiansheng.com/api/position-service'
const LIST = '/social-position/foreign/page-list'
const HEADERS = {
  'content-type': 'application/json;charset=UTF-8',
  accept: 'application/json, text/plain, */*',
  source: '24',
}
const KEYWORD = process.env['WAIQI_KEY'] ?? 'Java'
const SZ = Number(process.env['WAIQI_CITY_ID'] ?? '248')

/** 在 Node 侧直接 POST 列表接口（等价页面上下文里的 fetch，只是没有同源 Cookie）。 */
async function list(body: Record<string, unknown>): Promise<any> {
  const res = await fetch(API + LIST, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  })
  return res.json()
}

function recCount(payload: any): number | null {
  const vo = payload?.data?.positionVO?.records
  return Array.isArray(vo) ? vo.length : null
}
function resultCount(payload: any): number | null {
  const c = payload?.data?.count
  return typeof c === 'number' ? c : null
}
function firstIds(payload: any, n = 3): number[] {
  const vo = payload?.data?.positionVO?.records
  if (!Array.isArray(vo)) return []
  return vo
    .slice(0, n)
    .map((r: Record<string, unknown>) => Number(r['id']))
    .filter((id: number) => Number.isFinite(id))
}

const PASS: string[] = []
const FAIL: string[] = []
const INFO: string[] = []
function check(name: string, ok: boolean, detail = ''): void {
  ;(ok ? PASS : FAIL).push(`${name}${detail === '' ? '' : ' → ' + detail}`)
}

async function main(): Promise<void> {
  const wait = (ms = 400) => sleep(ms)

  // ── 0. 基线 ─────────────────────────────────────────────────────────────
  const base = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: 1, size: 20, needAd: 1 })
  check('基线 code=1000', base?.code === 1000, `code=${String(base?.code)} count=${String(resultCount(base))}`)
  const baseCount = resultCount(base)
  INFO.push(`基线结果数 count=${String(baseCount)} 全平台 total=${String(base?.data?.totalCount)}`)
  INFO.push(`单条记录字段：${Object.keys(base?.data?.positionVO?.records?.[0] ?? {}).join(', ')}`)
  await wait()

  // ── 1. 翻页（适配器断言 page>=2 恒空） ─────────────────────────────────
  for (const p of [1, 2, 3, 4, 5]) {
    const r = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: p, size: 20, needAd: 1 })
    await wait()
    INFO.push(`page=${p} → code=${String(r?.code)} records=${String(recCount(r))} count=${String(resultCount(r))}`)
  }
  const p2 = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: 2, size: 20, needAd: 1 })
  check('翻页 page=2 返回空（§3 硬事实）', recCount(p2) === 0, `records=${String(recCount(p2))}`)
  await wait()

  // ── 2. size 上限（断言 >50 → code 1010） ───────────────────────────────
  for (const size of [50, 51, 100]) {
    const r = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: 1, size, needAd: 1 })
    await wait()
    INFO.push(`size=${String(size)} → code=${String(r?.code)} records=${String(recCount(r))}`)
  }
  const s50 = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: 1, size: 50, needAd: 1 })
  check('size=50 正常返回 50 条', recCount(s50) === 50, `records=${String(recCount(s50))}`)
  const s100 = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: 1, size: 100, needAd: 1 })
  check('size=100 → code=1010', s100?.code === 1010, `code=${String(s100?.code)} msg=${String(s100?.message)}`)
  await wait()

  // ── 3. 关键词维度（断言只有 name 生效） ────────────────────────────────
  const kName = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: 1, size: 20, needAd: 1, name: KEYWORD })
  await wait()
  const kKeyword = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: 1, size: 20, needAd: 1, keyword: KEYWORD })
  await wait()
  const kN = resultCount(kName) ?? 0
  const kK = resultCount(kKeyword) ?? 0
  check(`关键词 name 生效（count<基线 ${String(baseCount)}）`, (baseCount ?? 0) > 0 && kN < (baseCount ?? 0), `name=${String(kN)}`)
  check('关键词 keyword 被忽略（≈基线）', Math.abs(kK - (baseCount ?? 0)) <= 1, `keyword=${String(kK)}`)
  await wait()

  // ── 4. 城市维度（断言 cityIds 生效、cityName 被忽略、且表内城市码有结果） ─
  const cIds = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: 1, size: 20, needAd: 1, cityIds: String(SZ) })
  await wait()
  const cName = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: 1, size: 20, needAd: 1, cityName: '深圳' })
  await wait()
  check('cityIds 生效（深圳有结果）', (resultCount(cIds) ?? 0) > 0, `count=${String(resultCount(cIds))}`)
  check('cityName 被忽略（≈基线）', Math.abs((resultCount(cName) ?? 0) - (baseCount ?? 0)) <= 1)
  await wait()

  // ── 5. workExp / education 值域 ─────────────────────────────────────────
  const we: Record<string, number> = {}
  for (const v of ['0', '1', '2', '3', '4', '5', '6', '7']) {
    const r = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: 1, size: 20, needAd: 1, workExp: v })
    we[v] = resultCount(r) ?? -1
    await wait()
  }
  INFO.push('workExp 点数：' + Object.entries(we).map(([k, v]) => `${k}=${String(v)}`).join(' / '))
  check('workExp 6/7 恒为 0 条（无效档位）', we['6'] === 0 && we['7'] === 0)
  const ed: Record<string, number> = {}
  for (const v of ['0', '1', '2', '3', '4', '6', '7', '8']) {
    const r = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: 1, size: 20, needAd: 1, education: v })
    ed[v] = resultCount(r) ?? -1
    await wait()
  }
  INFO.push('education 点数：' + Object.entries(ed).map(([k, v]) => `${k}=${String(v)}`).join(' / '))
  await wait()

  // ── 6. type 值域 ────────────────────────────────────────────────────────
  for (const t of [0, 1, 2, 3]) {
    const r = await list({ expectId: 0, status: 1, sort: 0, type: t, page: 1, size: 20, needAd: 1 })
    await wait()
    INFO.push(`type=${String(t)} → code=${String(r?.code)} count=${String(resultCount(r))}`)
  }
  const t0 = await list({ expectId: 0, status: 1, sort: 0, type: 0, page: 1, size: 20, needAd: 1 })
  check('type=0 → code 999（作为 bug 暴露）', t0?.code !== 1000, `code=${String(t0?.code)}`)
  await wait()

  // ── 7. sort 是否真的无效 ────────────────────────────────────────────────
  const sortIds: Record<string, number[]> = {}
  for (const s of [0, 1, 3, 5]) {
    const r = await list({ expectId: 0, status: 1, sort: s, type: 2, page: 1, size: 20, needAd: 1 })
    sortIds[String(s)] = firstIds(r)
    await wait()
  }
  const ids0 = sortIds['0'] ?? []
  const ids1 = sortIds['1'] ?? []
  const ids5 = sortIds['5'] ?? []
  const sAllEq = ids0.join() === ids1.join() && ids0.join() === ids5.join()
  INFO.push('sort id 序列：0=' + String(ids0) + ' 1=' + String(ids1) + ' 5=' + String(ids5))
  check('sort 收参数但结果不变（0/1/5 逐条一致）', sAllEq)
  await wait()

  // ── 8. 新维度候选：posIds / businessCategoryIdList / companyTypeList ────
  const pos = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: 1, size: 20, needAd: 1, posIds: '209' })
  await wait()
  const cat = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: 1, size: 20, needAd: 1, businessCategoryIdList: '30' })
  await wait()
  const ctype = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: 1, size: 20, needAd: 1, companyTypeList: ['外企'] })
  await wait()
  INFO.push(`posIds=209 count=${String(resultCount(pos))} · businessCategoryIdList=30 count=${String(resultCount(cat))} · companyTypeList=[外企] count=${String(resultCount(ctype))}`)

  // ── 9. 辅助接口 ─────────────────────────────────────────────────────────
  const eduEnum = await fetch(API.replace('/position-service', '/backend-service') + '/enum/education-enum?scene=not_limit', {
    headers: HEADERS,
    signal: AbortSignal.timeout(20_000),
  }).then((r) => r.json().catch(() => null))
  await wait()
  INFO.push(`education-enum → ${JSON.stringify(eduEnum)}`)

  const citySearch = await fetch(API.replace('/position-service', '/position-service') + `/city/search?name=${encodeURIComponent('深圳')}`, {
    signal: AbortSignal.timeout(20_000),
  }).then((r) => r.json().catch(() => null))
  await wait()
  INFO.push(`city/search?name=深圳 → ${JSON.stringify(citySearch)}`)

  const detail = await list({ expectId: 0, status: 1, sort: 0, type: 2, page: 1, size: 1, needAd: 0 })
  const detailId = detail?.data?.positionVO?.records?.[0]?.id
  let detailResp: any = null
  if (typeof detailId === 'number') {
    detailResp = await fetch(API + `/social-position/details?id=${String(detailId)}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(20_000),
    })
      .then((r) => r.json())
      .catch(() => null)
    await wait()
    INFO.push(`details?id=${String(detailId)} → code=${String(detailResp?.code)} dataKeys=${detailResp?.data ? Object.keys(detailResp.data).join(',') : '?'}`)
  }

  // ── 汇总 ────────────────────────────────────────────────────────────────
  console.log('\n========== 探针汇总 ==========')
  console.log(`PASS ${PASS.length} · FAIL ${FAIL.length}`)
  for (const i of INFO) console.log('  ℹ️ ' + i)
  console.log('\n-- PASS --')
  for (const p of PASS) console.log('  ✓ ' + p)
  console.log('\n-- FAIL（需要改适配器/文档） --')
  for (const f of FAIL) console.log('  ✗ ' + f)
  console.log(`\n退出码：${FAIL.length === 0 ? '0（全部断言通过，适配器无需改动）' : '1'}`)
  process.exitCode = FAIL.length === 0 ? 0 : 1
}

void main().catch((e: unknown) => {
  console.error('探针异常：', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
})