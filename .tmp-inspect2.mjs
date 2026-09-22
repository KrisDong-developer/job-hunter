import { readFileSync } from 'node:fs'
const html = readFileSync('d:/DSH-work/job-hunter/test/fixtures/51job-sz.html', 'utf8')
// 找页头区域的所有 <a href> 与 header 结构
const links = [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>/g)].map((m) => m[1])
const unique = [...new Set(links)]
console.log('unique hrefs:', unique.length)
for (const href of unique) console.log(' ', href)
console.log('\n--- header-ish region ---')
const i = html.indexOf('<header')
console.log(i >= 0 ? html.slice(i, i + 2500).replace(/></g, '>\n<') : '(no <header>)')
console.log('\n--- nav region ---')
const j = html.indexOf('class="nav')
console.log(j >= 0 ? html.slice(j - 200, j + 1500).replace(/></g, '>\n<') : '(no class="nav)')
