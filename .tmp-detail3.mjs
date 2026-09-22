const url = 'https://msearch.51job.com/jobs/shenzhen-nsq/173734620.html'
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
for (const kw of ['<h1', 'job_msg', 'det-detail', 'text-muted', '公司性质', '职位描述', '上班地址', '__NUXT__', 'window.__']) {
  const i = html.indexOf(kw)
  console.log(`\n=== ${kw} @${i} ===`)
  if (i >= 0) console.log(html.slice(Math.max(0, i - 300), i + 500).replace(/\s+/g, ' '))
}
