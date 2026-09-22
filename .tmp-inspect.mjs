import { readFileSync } from 'node:fs'
const html = readFileSync('d:/DSH-work/job-hunter/test/fixtures/51job-sz.html', 'utf8')
const i = html.indexOf('jobs.51job.com/all')
console.log('--- first detail link context ---')
console.log(html.slice(i - 320, i + 300).replace(/></g, '>\n<'))
const j = html.indexOf('class="jname')
console.log('--- jname context ---')
console.log(html.slice(j - 700, j + 500).replace(/></g, '>\n<'))
