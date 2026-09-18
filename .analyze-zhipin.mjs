/** 一次性调研：BOSS 夹具深挖（跑完即删）。纯 JS。 */
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const html = readFileSync('D:/DSH-work/job-hunter/test/fixtures/zhipin-search.html', 'utf8')
const dom = new JSDOM(html, { url: 'https://www.zhipin.com/web/geek/job?query=Java&city=101280600' })
const doc = dom.window.document

const wraps = doc.querySelectorAll('.job-card-wrap')
console.log('卡片数(.job-card-wrap):', wraps.length)

const first = wraps[0]
console.log('\n=== 第 1 张卡片 outerHTML（截 2600 字）===')
console.log(first?.outerHTML.slice(0, 2600))

console.log('\n=== 各卡片字段形态（前 5 张）===')
for (const wrap of Array.from(wraps).slice(0, 5)) {
  const box = wrap.querySelector('.job-card-box') ?? wrap
  const name = box.querySelector('.job-name')
  const salary = box.querySelector('.job-salary')
  const tags = Array.from(box.querySelectorAll('.tag-list li')).map((t) => (t.textContent ?? '').trim())
  const boss = box.querySelector('.boss-name')
  const company = box.querySelector('.company-name')
  const location = box.querySelector('.company-location')
  const href = name?.getAttribute('href') ?? ''
  console.log({
    title: (name?.textContent ?? '').trim(),
    href: href.slice(0, 60),
    salary: (salary?.textContent ?? '').trim(),
    salaryCodes: Array.from(new Set(Array.from((salary?.textContent ?? '')).map((c) => c.codePointAt(0))))
      .filter((cp) => cp >= 0xe000 && cp <= 0xf8ff)
      .map((cp) => 'U+' + cp.toString(16).toUpperCase()),
    tags,
    boss: (boss?.textContent ?? '').trim(),
    company: (company?.textContent ?? '').trim(),
    location: (location?.textContent ?? '').trim(),
  })
}

// 分页 / 下一页
console.log('\n=== 分页 ===')
const next = doc.querySelector('a.next, .options-pages a:last-child, [ka*="page-next"]')
console.log('next 候选:', next?.outerHTML?.slice(0, 200) ?? '未找到')
const options = doc.querySelector('.options-pages')
console.log('options-pages:', (options?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120))
