const url = 'https://jobs.51job.com/all/173730211.html'
const res = await fetch(url, {
  headers: {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'accept-language': 'zh-CN,zh;q=0.9',
  },
})
const html = await res.text()
console.log(html.slice(0, 3000))
console.log('...')
console.log('has __INITIAL_STATE__:', html.includes('__INITIAL_STATE__'), 'has window.__NUXT:', html.includes('__NUXT'))
console.log('title:', /<title>([^<]*)<\/title>/.exec(html)?.[1])
