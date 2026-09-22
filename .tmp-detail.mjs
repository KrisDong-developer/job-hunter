const url = 'https://jobs.51job.com/all/173730211.html'
const res = await fetch(url, {
  headers: {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'accept-language': 'zh-CN,zh;q=0.9',
  },
})
console.log('status', res.status, res.headers.get('content-type'))
const html = await res.text()
console.log('len', html.length)
// 抽样打印关键区段的原文（含类名）
for (const kw of ['job_msg', 'tCompany', 'class="cn"', '瀚阳', ' Microchip', '薪资', '任职', '公司性质', '行业']) {
  const i = html.indexOf(kw)
  console.log(`\n=== ${kw} @${i} ===`)
  if (i >= 0) console.log(html.slice(Math.max(0, i - 400), i + 600).replace(/\s+/g, ' '))
}
