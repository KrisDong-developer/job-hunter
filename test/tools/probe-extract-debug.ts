// 临时 debug（跑完即删）
import { extractDetailHtml } from '../../src/host/enrichment/providers/tianyancha/extractor.js'

const BASE = `<html><body><main><h1>北京雨花石云计算科技股份有限公司</h1><div>存续</div>
<div>统一社会信用代码：911101075938311163</div><div>法定代表人 ： 刘朋</div>
<div>注册资本：1,026.8万人民币</div><div>成立日期：2012-04-19</div><div>国标行业：技术推广服务</div>
<div>企业规模：中型</div><div>员工人数：160人</div></main>
<script id="__NEXT_DATA__">{"props":{"pageProps":{"dehydratedState":{}}}}</script></body></html>`

const html = BASE.replace(
  '{"dehydratedState":{}}',
  '{"dehydratedState":{"queries":[{"state":{"data":{"company":{"name":"北京雨花石云计算科技股份有限公司","creditCode":"911101075938311163","regStatus":"存续","estiblishTime":1334803200000,"regCapital":"1026.8万人民币","legalPersonName":"刘朋","industry":"技术推广服务"}}}}]}}',
)
const { record } = extractDetailHtml(html, 'https://x')
console.log('matchedName:', JSON.stringify(record.matchedName))
console.log('estDate:', record.estDate, '| regCapital:', record.regCapital, '| creditCode:', record.creditCode)
