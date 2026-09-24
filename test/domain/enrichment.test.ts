import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractDetailHtml } from '../../src/host/enrichment/providers/tianyancha/extractor.js'
import { matchCandidates } from '../../src/host/enrichment/matcher.js'

/**
 * 工商补全的两个纯函数：匹配裁决与页面解析（离线可测，不碰浏览器）。
 *
 * extractor 的输入是**实测页面形态**的等价 HTML（2026-09-24 实测
 * tianyancha.com/company/2346105960 的 label:value 文本结构）；
 * 真实 fixture 落盘后（probe 首跑）再补一条全量页面的用例。
 */

// ── matcher ─────────────────────────────────────────────────────────

const candidate = (name: string, url = '/company/1'): { name: string; status: string | null; creditCode: string | null; url: string } => ({
  name,
  status: '存续',
  creditCode: null,
  url,
})

test('matcher：唯一严格键全等 → exact（自动写入）', () => {
  const verdict = matchCandidates('北京雨花石云计算科技股份有限公司', [
    candidate('北京雨花石云计算科技股份有限公司', '/company/2346105960'),
    candidate('雨花石（深圳）科技有限公司', '/company/999'),
  ])
  assert.equal(verdict.kind, 'exact')
  assert.equal(verdict.kind === 'exact' ? verdict.pick.url : '', '/company/2346105960')
})

test('matcher：没有严格键全等的候选 → 人工点选（宽松同名不自动写）', () => {
  // 宽松键会把三者都归成"华为"，自动挑一个就是张冠李戴 —— 必须交给人
  const verdict = matchCandidates('华为技术有限公司', [
    candidate('华为云计算技术有限公司', '/company/1'),
    candidate('华为网络技术有限公司', '/company/2'),
  ])
  assert.equal(verdict.kind, 'pick-one')
})

test('matcher：多个 exact（全国同名）→ 人工点选；零候选 → unmatched', () => {
  const same = matchCandidates('甲乙丙科技有限公司', [
    candidate('甲乙丙科技有限公司', '/company/1'),
    candidate('甲乙丙科技有限公司', '/company/2'),
  ])
  assert.equal(same.kind, 'pick-one', '同名多主体不自动写')

  const none = matchCandidates('查无此司', [])
  assert.equal(none.kind, 'unmatched')
})

// ── extractor ───────────────────────────────────────────────────────

/** 实测页面等价形态：label:value 文本 + 简介 + 标题区标签。 */
const DETAIL_HTML = `
<html><body>
<div id="page-header"><input placeholder="请输入公司名称、老板姓名、品牌名称等" type="text"/></div>
<main>
  <h1>北京雨花石云计算科技股份有限公司</h1>
  <div>存续</div>
  <div class="tags">曾用名 新三板(正常上市) 小微企业 瞪羚企业 司法案件</div>
  <div>统一社会信用代码：911101075938311163</div>
  <div>法定代表人 ： 刘朋</div>
  <div>注册资本：1,026.8万人民币</div>
  <div>成立日期：2012-04-19</div>
  <div>电话：1352026***登录查看</div>
  <div>国标行业：技术推广服务</div>
  <div>企业规模：中型</div>
  <div>员工人数：160人</div>
  <div>简介：北京雨花石云计算科技股份有限公司 (曾用名：北京雨花石科技有限公司) ，成立于2012年，
    位于北京市。共对外投资了1家企业，参与招投标项目3次；此外企业还拥有行政许可2个。
    风险方面共发现企业有开庭公告7条。</div>
</main>
<script id="__NEXT_DATA__">{"props":{"pageProps":{"dehydratedState":{}}}}</script>
</body></html>`

test('extractor：label:value 文本路径取全字段（实测形态）', () => {
  const { record, hits } = extractDetailHtml(DETAIL_HTML, 'https://www.tianyancha.com/company/2346105960')
  assert.equal(record.creditCode, '911101075938311163')
  assert.equal(record.legalPerson, '刘朋')
  assert.equal(record.estDate, '2012-04-19')
  assert.equal(record.regStatus, '存续')
  assert.equal(record.industry, '技术推广服务')
  assert.equal(record.staffNum, '160人')
  assert.equal(record.suitCount, 7, '简介里的开庭公告计数')
  assert.equal(record.investCount, 1)
  assert.equal(record.licenseCount, 2)
  assert.ok(record.tags.includes('小微企业') && record.tags.includes('司法案件'), '标题区标签')
  assert.ok(record.regCapital !== null && record.regCapital.includes('1,026.8'))
  assert.ok(hits.length >= 8, '字段命中率（页面改版监测的探头）')
})

test('extractor：NEXT_DATA 里的结构化字段优先（estiblishTime 毫秒 → 日期）', () => {
  const html = DETAIL_HTML.replace(
    '{"dehydratedState":{}}',
    '{"dehydratedState":{"queries":[{"state":{"data":{"company":{"name":"北京雨花石云计算科技股份有限公司","creditCode":"911101075938311163","regStatus":"存续","estiblishTime":1334803200000,"regCapital":"1026.8万人民币","legalPersonName":"刘朋","industry":"技术推广服务"}}}}}]}}',
  )
  const { record } = extractDetailHtml(html, 'https://www.tianyancha.com/company/2346105960')
  assert.equal(record.estDate, '2012-04-19', '毫秒时间戳转 YYYY-MM-DD')
  assert.equal(record.matchedName, '北京雨花石云计算科技股份有限公司')
})

test('extractor：页面结构全变（0 字段命中）→ hits 为空，调用方据此报"解析失败"', () => {
  const { hits } = extractDetailHtml('<html><body>404 not found</body></html>', 'https://x')
  assert.equal(hits.length, 0)
})

test('extractor：注册资本里的"复制"按钮文本不混进值', () => {
  const html = DETAIL_HTML.replace('注册资本：1,026.8万人民币', '注册资本：1,026.8万人民币 复制')
  const { record } = extractDetailHtml(html, 'https://x')
  assert.ok(record.regCapital !== null && !record.regCapital.includes('复制'))
})
