import { readFileSync } from 'node:fs'
const html = readFileSync('d:/DSH-work/job-hunter/test/fixtures/51job-sz.html', 'utf8')
const kws = [
  'chat-popover', 'hr-name', 'hr-position', 'hr-tip', 'qrcode', '去聊聊',
  'class="chat"', 'btn apply', 'trace-name', '申请职位', 'apply-component',
  'pc-apply-resume', 'success_title', 'loginBtnClick', 'apply-component-hint-dialog',
]
for (const kw of kws) {
  const idx = []
  let i = -1
  while ((i = html.indexOf(kw, i + 1)) !== -1 && idx.length < 5) idx.push(i)
  console.log(kw.padEnd(28), 'count>=', idx.length, idx.slice(0, 3))
}
// 上下文样本
for (const kw of ['class="chat"', 'btn apply', 'loginBtnClick', 'apply-component-resume-dialog']) {
  const i = html.indexOf(kw)
  if (i >= 0) {
    console.log(`\n=== ctx: ${kw} ===`)
    console.log(html.slice(Math.max(0, i - 260), i + 420).replace(/\s+/g, ' '))
  }
}
