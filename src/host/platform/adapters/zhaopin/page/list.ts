/**
 * 智联**列表页**的页面上下文函数：卡片解析 / 登录态 / 下一页地址 / 总页数与当前页。
 *
 * ⚠️ 这些函数在真机上**脱离模块作用域**执行：整段自包含，**不得**引用本文件里新增的
 * 任何模块级值（常量 / 工具函数）—— 需要共享的值必须内联进函数体。离线 jsdom 测不出
 * 这个错（Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import type { RawJob } from '../../../types.js'
import type { ZhaopinConfig } from '../config.js'

/**
 * **在页面上下文里**把内嵌的 `__INITIAL_STATE__` 载荷读成紧凑数组。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量都会变成 `ReferenceError`（51job 真的踩过这个坑，
 * 见 `docs/ADAPTERS.md` §2）。
 *
 * ⚠️ 也**绝不能返回整个 state** —— `page.evaluate` 只能回传标量 JSON，
 * 而这个载荷有 200 KB+（实测）。所以在这里就裁成需要的字段。
 *
 * 为什么从 `document` 的 script 文本里解析，而不是读 `window.__INITIAL_STATE__`：
 * 实测那段脚本是**裸赋值**（`__INITIAL_STATE__={...}`），是否挂到 `window` 上
 * 取决于打包器的后续处理，而**脚本文本一定在 DOM 里** —— 少依赖一个"打包器行为"。
 */
/**
 * 载荷解析**必须**留在 `extractJobsInPage` 内部，不能提成模块级函数：
 * 页面函数会被序列化后送进浏览器，闭包不存在，引用任何模块作用域的符号都会
 * `ReferenceError` 并导致整页解析失败（51job 踩过同一个坑）。
 */

/**
 * **在页面上下文里**解析列表页（DOM 为主，内嵌载荷补字段）。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量或函数都会变成 `ReferenceError`（51job 真的踩过这个坑，
 * 见 `docs/ADAPTERS.md` §2）。所以**载荷解析与配平全部内联在函数体里** ——
 * 抽成模块级的 `readStateFromPage()` 看着更整洁，但一上真浏览器就整页失败。
 * `test/platform/zhaopin.test.ts` 的「按源码重建」护栏就是钉死这条的。
 *
 * ⚠️ 载荷**绝不能整个返回**：`page.evaluate` 只能回传标量 JSON，
 * 而它在真实页面上有 200 KB+（实测）。所以在这里就裁成需要的字段。
 *
 * 合并策略：`__INITIAL_STATE__.positionList` 与 `.joblist-box__item` **渲染顺序一致**
 * （实测都是 20 条、逐条对得上），按索引配对；DOM 能给的优先用 DOM
 * （它是"页面实际展示了什么"的直接证据），DOM 给不了的（发布时间/行业/公司规模）
 * 用载荷补。
 *
 * 为什么从 `document` 的 script 文本里解析载荷，而不是读 `window.__INITIAL_STATE__`：
 * 实测那段脚本是**裸赋值**（`__INITIAL_STATE__={...}`），是否挂到 `window` 上
 * 取决于打包器的后续处理，而**脚本文本一定在 DOM 里** —— 少依赖一个"打包器行为"。
 *
 * @param config 选择器与 URL 配置（由宿主序列化传入）
 */
export function extractJobsInPage(config: ZhaopinConfig): RawJob[] {
  const maxCards = 200 // 列表页最多解析多少张卡片，防止异常页面把内存打满
  const maxStateItems = 200 // 同上，载荷侧的上限

  // ── 内联：把 __INITIAL_STATE__.positionList 读成紧凑数组（自包含，不可外提） ──
  const state: Array<Record<string, unknown>> = []
  {
    const scripts = Array.prototype.slice.call(document.querySelectorAll('script')) as Element[]
    for (const script of scripts) {
      const text = script.textContent ?? ''
      if (text === '' || text.indexOf('__INITIAL_STATE__') < 0) continue

      const braceStart = text.indexOf('{', text.indexOf('__INITIAL_STATE__'))
      if (braceStart < 0) continue

      // 载荷是 `__INITIAL_STATE__={...}`，对象一直写到脚本结尾。
      // 用大括号配平（而不是正则）取完整 JSON —— 只有配平才能处理嵌套与字符串里的括号。
      let depth = 0
      let inString = false
      let escaped = false
      let stop = -1
      for (let i = braceStart; i < text.length; i += 1) {
        const ch = text.charAt(i)
        if (inString) {
          if (escaped) escaped = false
          else if (ch === '\\') escaped = true
          else if (ch === '"') inString = false
          continue
        }
        if (ch === '"') inString = true
        else if (ch === '{') depth += 1
        else if (ch === '}') {
          depth -= 1
          if (depth === 0) {
            stop = i
            break
          }
        }
      }
      if (stop < 0) continue

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(text.slice(braceStart, stop + 1)) as Record<string, unknown>
      } catch {
        continue
      }

      const list = parsed.positionList
      if (!Array.isArray(list)) continue
      for (const item of list.slice(0, maxStateItems)) {
        if (item === null || typeof item !== 'object') continue
        state.push(item as Record<string, unknown>)
      }
      break
    }
  }

  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()
  const textOf = (node: Element | null): string => (node === null ? '' : clean(node.textContent))
  const attrOf = (node: Element | null, name: string): string =>
    node === null ? '' : clean(node.getAttribute(name))
  const queryAll = (scope: Element | Document, selector: string): Element[] => {
    try {
      return Array.prototype.slice.call(scope.querySelectorAll(selector)) as Element[]
    } catch {
      return []
    }
  }

  // 从详情链接里抽出岗位 id：`.../jobdetail/CC381381910J40896290805.htm`
  const jobIdOf = (href: string): string => {
    const m = /jobdetail\/([A-Za-z0-9]+)\.htm/.exec(href)
    return m === null || m[1] === undefined ? '' : m[1]
  }

  const selectors = config.selectors
  const cards = queryAll(document, selectors.card).slice(0, maxCards)
  const out: RawJob[] = []

  // ── AB 分流兜底：同一 `/sou/` URL 可能落到非目标路由（见文件头） ─────────────
  // 实测 `/sou/jl765?kw=Java` 两次访问，一次落到 jobinfo 明文页，一次被分流到旧的
  // `/jobs` 掩码页（卡片是 `.job-card`，不在 `selectors.card` 里，薪资还掩码成 `**-**元`）。
  // 这时 DOM 卡片为 0，但 `__INITIAL_STATE__.positionList` 往往仍带着 20 条真值
  // （`salary60` 明文）。与其把这一整轮判成"没岗位/被墙"白丢，不如凭载荷补开出数。
  if (cards.length === 0 && state.length > 0) {
    const textOfItem = (item: Record<string, unknown>, key: string): string => {
      const value = item[key]
      if (typeof value === 'string') return clean(value)
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
      return ''
    }
    for (let i = 0; i < state.length; i += 1) {
      const item = state[i]
      if (item === undefined) continue
      const jobId = textOfItem(item, 'number')
      const salary = textOfItem(item, 'salary60')
      const notes: string[] = []
      if (jobId === '') notes.push('jobId:missing')
      if (salary.indexOf('*') >= 0) notes.push('salary:masked-by-login')
      // 与 DOM 路径同款：技能/福利标签取载荷 showSkillTags，剔掉学历/经验项。
      const edu = textOfItem(item, 'education')
      const exp = textOfItem(item, 'workingExp')
      const tags: string[] = []
      const rawTags = item['showSkillTags']
      if (Array.isArray(rawTags)) {
        for (const t of rawTags) {
          if (t === null || typeof t !== 'object') continue
          const value = (t as Record<string, unknown>)['tag']
          const s = typeof value === 'string' ? clean(value) : ''
          if (s === '' || s === edu || s === exp) continue
          if (tags.indexOf(s) < 0) tags.push(s)
        }
      }
      out.push({
        platformJobId: jobId,
        title: textOfItem(item, 'name'),
        // 载荷里的薪资是明文；万一哪天变成掩码，同样不许回流成占位符。
        salaryRaw: salary.indexOf('*') >= 0 ? '' : salary,
        company: textOfItem(item, 'companyName'),
        sourceUrl: jobId === '' ? '' : config.detailUrlTemplate.split('{jobId}').join(jobId),
        city: textOfItem(item, 'workCity'),
        district: textOfItem(item, 'cityDistrict'),
        expReq: exp,
        eduReq: edu,
        tags,
        publishedAt: textOfItem(item, 'publishTime') === '' ? null : textOfItem(item, 'publishTime'),
        industry: textOfItem(item, 'industryName') === '' ? null : textOfItem(item, 'industryName'),
        companySize: textOfItem(item, 'companySize') === '' ? null : textOfItem(item, 'companySize'),
        companyNature: textOfItem(item, 'propertyName') === '' ? null : textOfItem(item, 'propertyName'),
        notes,
      })
    }
    return out
  }

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index]
    if (card === undefined) continue
    const notes: string[] = []
    const fromState = state[index] ?? null
    /**
     * 读载荷里的字段。
     *
     * ⚠️ 这里的 key 是**平台载荷自己的字段名**（`salary60` / `number` / `publishTime`…），
     * 不是本适配器 `RawJob` 的字段名 —— 载荷解析已内联进本函数，存的就是原始条目。
     * 早期版本把载荷先映射成 `salary`/`positionUrl` 再读，内联后就对不上号了，
     * 会让薪资/详情地址静默变成空串（正是 §4.2.4 要防的静默失败）。
     */
    const stateText = (key: string): string => {
      if (fromState === null) return ''
      const value = fromState[key]
      if (typeof value === 'string') return clean(value)
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
      return ''
    }

    // 技能/福利标签从载荷 `showSkillTags` 读（结构化数组），**不**用那个混了公司标签的
    // `.joblist-box__item-tag` DOM 选择器。注意它会把学历/经验当第一条 tag 混进来，
    // 这里按已解析出的 edu/exp 剔掉，剩下的才是"技能/福利"语义。
    const tags = ((): string[] => {
      if (fromState === null) return []
      const raw = fromState['showSkillTags']
      if (!Array.isArray(raw)) return []
      const edu = stateText('education')
      const exp = stateText('workingExp')
      const out: string[] = []
      for (const item of raw) {
        if (item === null || typeof item !== 'object') continue
        const value = (item as Record<string, unknown>)['tag']
        const s = typeof value === 'string' ? clean(value) : ''
        if (s === '' || s === edu || s === exp) continue
        if (out.indexOf(s) < 0) out.push(s)
      }
      return out
    })()

    // ── 标题 + 详情链接（同一个 <a>，所以我们才有岗位 id） ────────────
    const titleNode = queryAll(card, selectors.title)[0] ?? null
    const domTitle = textOf(titleNode)
    const href = attrOf(titleNode, 'href')
    // 岗位 id 优先载荷里的 `number`（实测 126 字段全在，是最稳的权威 id），
    // DOM href 正则兜底。两处都是同一形式的 `CC{公司号}J{职位号}`。
    const stateJobId = stateText('number')
    const jobId = stateJobId !== '' ? stateJobId : jobIdOf(href)

    // ── 薪资（/sou/ 上是明文；掩码只应出现在老路由，识别出来就别当薪资用） ──
    const domSalary = textOf(queryAll(card, selectors.salary)[0] ?? null)
    const masked = domSalary !== '' && domSalary.indexOf('*') >= 0

    // ── 地点 / 经验 / 学历：三项同构，**地点靠"有 location 图标/span"识别**，
    //    经验与学历才是后面两项。这样就不必依赖固定下标。
    let city = ''
    let district = ''
    const rest: string[] = []
    for (const item of queryAll(card, selectors.otherInfoItem)) {
      const isLocation =
        item.querySelector(selectors.locationSpan) !== null ||
        queryAll(item, '.jobinfo__other-info-location-image').length > 0
      const value = textOf(item)
      if (isLocation) {
        // 形如「深圳·宝安·新安」，分隔符实测是全角间隔点
        const parts = value.split('·')
        city = clean(parts[0] ?? '')
        district = clean(parts[1] ?? '')
      } else if (value !== '') {
        rest.push(value)
      }
    }

    if (fromState === null) notes.push('tracking:missing-element')
    if (masked) notes.push('salary:masked-by-login')
    if (jobId === '') notes.push('jobId:missing')

    out.push({
      platformJobId: jobId,
      title: domTitle !== '' ? domTitle : stateText('name'),
      // 掩码一律记成空：把 `**-**元` 当薪资写进库，会把 20 条岗位的薪资全污染成占位符。
      // 薪资优先级：DOM 的真实值 > 载荷的真实值 > 留空。
      // ⚠️ 掩码（`**-**元`）**绝不能回流**：拿它当薪资会把整页薪资污染成占位符。
      // 但掩码也**不能**直接把 salaryRaw 判死 —— 载荷里往往还有真实值
      // （老路由 `/jobs` 就是"DOM 掩码、载荷明文"），白白丢掉就是浪费已有数据。
      // 只有两边都没有真实值时才是空，那种记录由 platform/validate.ts 隔离。
      salaryRaw: domSalary !== '' && !masked ? domSalary : stateText('salary60'),
      company: textOf(queryAll(card, selectors.company)[0] ?? null) || stateText('companyName'),
      sourceUrl: jobId === '' ? '' : config.detailUrlTemplate.split('{jobId}').join(jobId),
      city: city !== '' ? city : stateText('workCity'),
      district: district !== '' ? district : stateText('cityDistrict'),
      // 经验/学历：DOM 上只有"后两项"这个位置信息，容易错位，
      // 所以只用载荷里的精确值；拿不到就留空，**不猜**。
      expReq: stateText('workingExp'),
      eduReq: stateText('education'),
      tags,
      publishedAt: stateText('publishTime') === '' ? null : stateText('publishTime'),
      industry: stateText('industryName') === '' ? null : stateText('industryName'),
      companySize: stateText('companySize') === '' ? null : stateText('companySize'),
      companyNature: stateText('propertyName') === '' ? null : stateText('propertyName'),
      notes,
    })
  }

  return out
}

/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * 只认**结构性信号**，不认文案：实测 `/sou/` 结果页在未登录时会给列表容器和
 * 每张卡片加上 `-unlogin` 修饰类（`positionlist__list-unlogin` /
 * `joblist-box__item-unlogin`），底部还有一个 `positionlist__login-foot`。
 * 这些比"页面上有没有『登录』两个字"稳得多 —— 后者在**正常结果页**上同样成立
 * （右上角一直有登录入口），拿它判断会导致"永远判定为未登录"。
 */
export function isLoggedInInPage(_arg: { loginPopup: string; loginGateText: string }): boolean {
  // 优先信载荷里的明确信号：`__INITIAL_STATE__.isLogged` 是平台的权威判定（实测为布尔）。
  // 只有它是 **true** 时才短路 —— false 不直接下结论（老结构页可能没有该字段），
  // 好继续用结构类名兜底。
  for (const script of Array.prototype.slice.call(document.querySelectorAll('script')) as Element[]) {
    const text = script.textContent ?? ''
    if (text.indexOf('__INITIAL_STATE__') < 0) continue
    const m = /"isLogged"\s*:\s*(true|false)/.exec(text)
    if (m !== null && m[1] === 'true') return true
  }
  if (document.querySelector('.joblist-box__item-unlogin') !== null) return false
  if (document.querySelector('.positionlist__list-unlogin') !== null) return false
  // `positionlist__login-foot` 这个块**在已登录时也存在于 DOM 里**（只是 display:none），
  // 所以不能"存在即未登录" —— 必须先判断它是不是真的显示出来了。
  let foot = null as Element | null
  try {
    foot = document.querySelector('.positionlist__login-foot')
  } catch {
    foot = null
  }
  if (foot !== null) {
    const style = foot.getAttribute('style') ?? ''
    const hiddenByStyle = style.replace(/\s+/g, '').indexOf('display:none') >= 0
    if (!hiddenByStyle && foot.getAttribute('hidden') === null) return false
  }
  return true
}

/**
 * **在页面上下文里**取下一页的无 query path 地址。
 *
 * 为什么读真实 href 而不是自己拼：站点把关键词编码成了自己的 token
 * （`/sou/jl765/kw01500O80EO062/p2`），明文塞进 path 会被判无效并返回 0 条。
 * 分页区的 href 是**站点自己生成的**，直接用它最稳，也顺带满足 robots（无 query）。
 */
export function nextPageUrlInPage(arg: { pagination: string }): string | null {
  const links = Array.prototype.slice.call(
    document.querySelectorAll(arg.pagination + ' a'),
  ) as Element[]
  for (const link of links) {
    const href = link.getAttribute('href')
    if (href === null || href === '') continue
    const label = (link.textContent ?? '').replace(/\s+/g, '')
    const disabled = link.getAttribute('disabled') !== null || /disable/.test(link.className)
    if (label === '下一页' && !disabled) {
      // 相对地址补全成绝对地址，交给 goto 处理。
      if (href.indexOf('http') === 0) return href
      return 'https://www.zhaopin.com' + (href.indexOf('/') === 0 ? href : '/' + href)
    }
  }
  return null
}

/** 站点自报的总页数（用于"别翻过实际页数"）。 */
export function totalPagesInPage(): number {
  const scripts = Array.prototype.slice.call(document.querySelectorAll('script')) as Element[]
  for (const script of scripts) {
    const text = script.textContent ?? ''
    const marker = text.indexOf('__INITIAL_STATE__')
    if (marker < 0) continue
    const m = /"pages"\s*:\s*(\d+)/.exec(text.slice(marker))
    if (m !== null && m[1] !== undefined) return Number.parseInt(m[1], 10)
  }
  return 0
}

/** 当前页码（从内嵌载荷里读）。 */
export function currentPageInPage(): number {
  const scripts = Array.prototype.slice.call(document.querySelectorAll('script')) as Element[]
  for (const script of scripts) {
    const text = script.textContent ?? ''
    const marker = text.indexOf('__INITIAL_STATE__')
    if (marker < 0) continue
    const m = /"pageIndex"\s*:\s*(\d+)/.exec(text.slice(marker))
    if (m !== null && m[1] !== undefined) return Number.parseInt(m[1], 10)
  }
  return 0
}
