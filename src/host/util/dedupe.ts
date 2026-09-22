/**
 * 跨平台去重：**多级漏斗，不是单一距离**（§4.10.1）。
 *
 * 为什么不能只算编辑距离：「字节跳动」vs「北京字节跳动科技有限公司」的编辑距离很大，
 * 会被判成两家公司。正确顺序是先归一化、再看别名、再看包含关系，最后才轮到相似度兜底。
 *
 * **三条铁律**（这里逐条落地）：
 *   1. **不确定时宁可不合并** —— 默认阈值偏保守，宁可漏合并，不可误合并；
 *   2. **去重必须可逆** —— 本模块只给判断，落库与拆开由 `domain/dedupe.ts` 负责，
 *      合并会写 `company_signal(type='name-merge')` 留下可反查的依据；
 *   3. **每次合并记录依据** —— 返回值里的 `basis` 是人话，不是分数。
 */
import { COMPANY_SUFFIXES, LEGAL_SUFFIXES, normalizeCompanyName, strictCompanyName } from './company-name.js'

/**
 * 「行业词 / 机构词」—— 宽松归一化会剥、严格归一化**不剥**的那些。
 *
 * 不另立一张表：它就是两张表的差集。多写一张表迟早会漂移，而漂移的表现是
 * "某个词到底算不算行业词"在两条路径上答案不同 —— 那正是这类 bug 最难查的形态。
 */
const WEAK_COMPANY_WORDS: ReadonlySet<string> = new Set(
  COMPANY_SUFFIXES.filter((word) => !LEGAL_SUFFIXES.includes(word)),
)

export type DedupeLevel = 'normalized' | 'alias' | 'containment' | 'similarity' | 'none'

export interface DedupeVerdict {
  /** 是否应当合并。 */
  merge: boolean
  level: DedupeLevel
  /** 可读依据（会原样落库到 `company_signal.evidence`）。 */
  basis: string
  /** 0-1；`normalized`/`alias` 命中时为 1。 */
  score: number
}

/** 相似度阈值。调高更保守（漏合并），调低更激进（误合并）—— 铁律 1 选择保守。 */
export const SIMILARITY_THRESHOLD = 0.88
/** 包含关系的最低长度：太短的包含（如「中」⊂「中国」）没有意义。 */
export const CONTAINMENT_MIN_LENGTH = 3
/** 编辑距离只在长度接近时才有意义。 */
const LENGTH_RATIO_FLOOR = 0.7
/** 超过这个长度就不算编辑距离了 —— O(n·m) 在长串上会浪费，而长公司名本就少。 */
const LEVENSHTEIN_MAX_LENGTH = 64

export interface DedupeOptions {
  /** 归一化键 → 已知等价名列表（`company.aliases_json`）。 */
  aliases?: ReadonlyMap<string, readonly string[]>
  similarityThreshold?: number
}

/** 字符 bigram 集合（中文没有词边界，bigram 是最实用的近似）。 */
export function bigrams(value: string): Set<string> {
  const set = new Set<string>()
  if (value.length === 1) {
    set.add(value)
    return set
  }
  for (let index = 0; index + 1 < value.length; index += 1) {
    set.add(value.slice(index, index + 2))
  }
  return set
}

/** Jaccard 相似度（bigram 集合）。 */
export function bigramSimilarity(left: string, right: string): number {
  if (left === right) return 1
  if (left === '' || right === '') return 0
  const a = bigrams(left)
  const b = bigrams(right)
  let intersection = 0
  for (const gram of a) if (b.has(gram)) intersection += 1
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** 归一化编辑距离相似度（1 - 距离/较长长度）。 */
export function levenshteinSimilarity(left: string, right: string): number {
  if (left === right) return 1
  if (left === '' || right === '') return 0
  if (left.length > LEVENSHTEIN_MAX_LENGTH || right.length > LEVENSHTEIN_MAX_LENGTH) return 0

  const short = left.length <= right.length ? left : right
  const long = left.length <= right.length ? right : left
  let previous = Array.from({ length: short.length + 1 }, (_value, index) => index)
  let current = new Array<number>(short.length + 1).fill(0)

  for (let row = 1; row <= long.length; row += 1) {
    current[0] = row
    for (let column = 1; column <= short.length; column += 1) {
      const cost = long[row - 1] === short[column - 1] ? 0 : 1
      const deletion = (previous[column] ?? 0) + 1
      const insertion = (current[column - 1] ?? 0) + 1
      const substitution = (previous[column - 1] ?? 0) + cost
      current[column] = Math.min(deletion, insertion, substitution)
    }
    const swap = previous
    previous = current
    current = swap
  }

  const distance = previous[short.length] ?? long.length
  return 1 - distance / long.length
}

/**
 * 判断两条公司名是否指向同一实体。
 *
 * @param left 公司名 A（原始写法即可，内部会归一化）
 * @param right 公司名 B
 */
export function compareCompanyNames(
  left: string,
  right: string,
  options: DedupeOptions = {},
): DedupeVerdict {
  const a = normalizeCompanyName(left)
  const b = normalizeCompanyName(right)
  if (a === '' || b === '') {
    return { merge: false, level: 'none', basis: '公司名归一化后为空，无法判断', score: 0 }
  }

  // 第 1 级：归一化后完全一致
  if (a === b) {
    return {
      merge: true,
      level: 'normalized',
      basis: `归一化后完全一致（「${left}」与「${right}」→「${a}」）`,
      score: 1,
    }
  }

  // 第 2 级：别名表精确命中（人工维护的已知等价名）
  const aliases = options.aliases
  if (aliases !== undefined) {
    const aAliases = aliases.get(a) ?? []
    const bAliases = aliases.get(b) ?? []
    if (aAliases.includes(b) || bAliases.includes(a)) {
      return { merge: true, level: 'alias', basis: `别名表命中：「${a}」≡「${b}」`, score: 1 }
    }
  }

  // 第 3 级：包含关系（要求较短的一方足够长，避免「中」⊂「中国」这种噪音）
  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  if (shorter.length >= CONTAINMENT_MIN_LENGTH && longer.includes(shorter)) {
    return {
      merge: true,
      level: 'containment',
      basis: `包含关系：「${shorter}」⊂「${longer}」`,
      score: 0.95,
    }
  }

  // 第 4 级：bigram 相似度 / 编辑距离兜底
  const similarity = bigramSimilarity(a, b)
  const threshold = options.similarityThreshold ?? SIMILARITY_THRESHOLD
  if (similarity >= threshold) {
    return {
      merge: true,
      level: 'similarity',
      basis: `字符 bigram 相似度 ${similarity.toFixed(2)} ≥ ${String(threshold)}`,
      score: similarity,
    }
  }

  const lengthRatio = shorter.length / longer.length
  if (lengthRatio >= LENGTH_RATIO_FLOOR) {
    const edit = levenshteinSimilarity(a, b)
    if (edit >= threshold) {
      return {
        merge: true,
        level: 'similarity',
        basis: `编辑距离相似度 ${edit.toFixed(2)} ≥ ${String(threshold)}`,
        score: edit,
      }
    }
  }

  // 第 5 级：**不确定不合并**
  return {
    merge: false,
    level: 'none',
    basis: `差异过大，不合并（bigram ${similarity.toFixed(2)}，编辑距离未过阈值）—— 交给人工确认`,
    score: similarity,
  }
}

// ── 岗位去重（§4.10.1 末段）─────────────────────────────────────────

/** 岗位去重键的组成部分。 */
export interface JobDedupeKey {
  /**
   * **宽松**公司键（地域 + 法人后缀 + 行业词都剥）。
   *
   * 只用来判"疑似"：两个键相等说明差异**仅在于行业词/机构词**
   * （「XX网络科技」vs「XX网络技术」）—— 可能是同一家，也可能不是，交给人看。
   */
  companyKey: string
  /**
   * **严格**公司键（只剥地域 + 法人/机构后缀，保留行业词）。
   *
   * 自动合并**只认它**。行业词被剥掉之后「XX网络科技有限公司」与「XX网络技术有限公司」
   * 会落到同一个「XX网络」，再撞上同名通用标题 + 同城 + 同薪资档，就会把两个真岗位
   * 合掉 —— 而合并的代价是投递记录串在一起，且极难发现。
   */
  companyKeyStrict: string
  titleClean: string
  salaryBucket: string
  city: string
}

/** 标题清洗：去括号补充、去常见修饰、去空白。 */
export function cleanJobTitle(title: string): string {
  return title
    // 【高薪】/（深圳）/ [急聘] 这类补充说明整块去掉，它们不是岗位名的一部分
    .replace(/[（(【[][^）)】\]]*[）)】\]]/g, '')
    .replace(/(急招|诚聘|高薪|双休|包住|五险一金|应届|实习)/g, '')
    .replace(/[（）()【】[\]]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim()
}

/** 薪资分桶：把 13K 与 15K 归到同一桶，避免因为范围微差就判成两个岗位。 */
export function salaryBucketOf(min: number | null, max: number | null): string {
  if (min === null) return UNKNOWN_SALARY_BUCKET
  const anchor = max === null ? min : Math.round((min + max) / 2)
  const step = 5000
  return `b${String(Math.floor(anchor / step))}`
}

/**
 * **薪资未锚定**的哨兵值（该平台没给薪资，如 BOSS 未登录时的空薪资）。
 *
 * 它必须与"某个真实档位"区分开：R25 的成因正是把 `'unknown'` 当成了一个普通档位，
 * 于是"一侧没薪资"被当成"薪资不同" → **同一个岗位在不同平台永远不会合并**。
 */
export const UNKNOWN_SALARY_BUCKET = 'unknown'

/**
 * 城市**归一到市级**再比较。
 *
 * BOSS 的卡片给「深圳·福田区·车公庙」（适配器会拆成 city/district），
 * 但别的平台可能把「深圳-福田」整个塞进 city。不归一的话，
 * 「深圳」与「深圳-福田」会被判成两个城市 —— 又是静默地少合并（R25）。
 */
export function normalizeCityForDedupe(city: string): string {
  const first = city
    .trim()
    // 常见分隔：· ・ - — – | / 、 以及中英文逗号与空格后接区名
    .split(/[·・\-—–|/、,，\s]/)
    .map((part) => part.trim())
    .find((part) => part !== '')
  if (first === undefined) return ''
  // 「深圳市」与「深圳」是同一个城市
  return first.replace(/市$/, '')
}

export function jobDedupeKey(input: {
  companyName: string
  title: string
  salaryMin: number | null
  salaryMax: number | null
  city: string
}): JobDedupeKey {
  return {
    companyKey: normalizeCompanyName(input.companyName),
    companyKeyStrict: strictCompanyName(input.companyName),
    titleClean: cleanJobTitle(input.title),
    salaryBucket: salaryBucketOf(input.salaryMin, input.salaryMax),
    city: normalizeCityForDedupe(input.city),
  }
}

export interface JobDedupeVerdict {
  merge: boolean
  basis: string
  score: number
  /**
   * 疑似重复，但**没到合并门槛** —— 值得人来确认一下。
   *
   * 为什么必须有这个出口：硬门槛全过了（同公司、同城、薪资不冲突），只是标题差一点。
   * 不自动合并是对的（宁可漏、不可错），但**"没合并"这件事本身也得能被看见** ——
   * 否则用户永远不知道自己少了几个合并，也无从纠正。
   */
  candidate: boolean
}

/** 疑似重复的相似度下界。低于它连提都不提 —— 否则"疑似"会变成噪音。 */
export const CANDIDATE_SIMILARITY = 0.75

/**
 * 公司这一关判到哪一档。
 *
 * * `same` —— 允许自动合并；
 * * `weak` —— **只有**"疑似"：两家公司名只差一个行业词/机构词，而且**不是**
 *   "少写了一个词"那种关系（见下）；
 * * `none` —— 不同（含公司名归一化后为空）。
 *
 * 两档的判据为什么不是简单的一句"严格键相等"：
 *
 * * 「北京字节跳动科技有限公司」与「字节跳动」→ 严格键分别是「字节跳动科技」与「字节跳动」，
 *   长的那边**正好多一个行业词**。这是**写法差异**（同一个词写没写全），算同一个公司
 *   —— 这种形态在跨平台数据里极其常见，一刀切成"疑似"等于把去重废掉。
 * * 「XX网络科技有限公司」与「XX网络技术有限公司」→ 严格键是「XX网络科技」与「XX网络技术」，
 *   谁也不包含谁 —— 是**替换了一个行业词**，语义上可能就是两家不同的公司。
 *   这种才是危险的：硬键一相等，再撞上通用标题 + 同城 + 同薪资档，两个真岗位就被合掉了。
 *
 * 所以用"差集是否恰好是一个被剥掉的词 + 前缀关系"来区分这两者，
 * 而不是把整个行业词表重新引入硬键。
 */
export function companyTierOf(left: JobDedupeKey, right: JobDedupeKey): 'same' | 'weak' | 'none' {
  const a = left.companyKeyStrict
  const b = right.companyKeyStrict
  if (a === '' || b === '') return 'none'
  if (a === b) return 'same'

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  if (longer.startsWith(shorter) && WEAK_COMPANY_WORDS.has(longer.slice(shorter.length))) {
    // 只是"少写了一个行业词" —— 写法差异，仍算同一个公司
    return 'same'
  }
  if (left.companyKey !== '' && left.companyKey === right.companyKey) return 'weak'
  return 'none'
}

/**
 * 判断两个岗位是不是「同一个岗位在不同平台」。
 *
 * 比公司名更保守：硬键必须一致，标题再做一次相似度确认。
 * 岗位标题天然差异大（「Java开发工程师」vs「Java 后端工程师」），
 * 所以标题相似度只作为**确认**，不作为主要依据 —— 宁可保留两个，也不要把两个
 * 真岗位合成一个（合并后投递记录会串）。
 *
 * ## 公司名这一关分两档（2026-09-21 修，判据在 `companyTierOf`）
 *
 * * **`same`** → 公司过了，继续看城市 / 薪资 / 标题。除了"严格键完全相等"，
 *   还包括"**只少写了一个行业词**"（「字节跳动科技」vs「字节跳动」）——
 *   那是写法差异，在跨平台数据里极其常见，一刀切成"疑似"等于把去重废掉。
 * * **`weak`** → **不自动合并**，判成"疑似"交人看。成因见 `company-name.ts` 的
 *   `LEGAL_SUFFIXES`：把行业词也剥掉之后，「XX网络科技」与「XX网络技术」会变成
 *   同一家公司 —— 那是"**换了一个行业词**"，语义上可能就是两家不同的公司，
 *   再撞上通用标题 + 同城 + 同薪资档，两个真岗位就会被合掉。
 *
 * 三条硬键各有各的**缺值**处理（R25）：
 *   * 公司：归一化后为空 → 直接不判（无法判断，不是"不同"）；
 *   * 城市：比较前**归一到市级**（`normalizeCityForDedupe`）；
 *   * 薪资：**只在两边都锚定时**才当门槛 —— "未知"不等于"不同"。
 */
export function compareJobs(
  left: JobDedupeKey,
  right: JobDedupeKey,
  threshold = 0.9,
): JobDedupeVerdict {
  const companyTier = companyTierOf(left, right)
  if (companyTier === 'none') {
    return left.companyKeyStrict === '' || right.companyKeyStrict === ''
      ? { merge: false, basis: '公司名为空，不合并', score: 0, candidate: false }
      : { merge: false, basis: '公司不同，不合并', score: 0, candidate: false }
  }
  if (left.city !== right.city) {
    return {
      merge: false,
      basis: `城市不同（${left.city} / ${right.city}），不合并`,
      score: 0,
      candidate: false,
    }
  }

  const salaryAnchored =
    left.salaryBucket !== UNKNOWN_SALARY_BUCKET && right.salaryBucket !== UNKNOWN_SALARY_BUCKET
  if (salaryAnchored && left.salaryBucket !== right.salaryBucket) {
    return {
      merge: false,
      basis: `薪资档不同（${left.salaryBucket} / ${right.salaryBucket}），不合并`,
      score: 0,
      candidate: false,
    }
  }
  // 依据里必须写清"薪资这次没参与判断" —— 否则事后复盘会以为它比过了
  const salaryNote = salaryAnchored
    ? `同薪资档（${left.salaryBucket}）`
    : '薪资未锚定（一侧为空，此项未作门槛）'

  const similarity = bigramSimilarity(left.titleClean, right.titleClean)
  /**
   * 公司只到"宽松相等"：**不合并，但必须报出来**。
   *
   * 城市与薪资已经过了才走到这里 —— 也就是说这几条在用户眼里几乎一模一样，
   * 唯一的疑点是"公司名差一个行业词"。这种"我拿不准"正是 `candidate` 存在的理由：
   * 不自动合并（宁可漏），但让人能一眼看见（不可错得太安静）。
   */
  if (companyTier === 'weak') {
    return {
      merge: false,
      basis:
        `公司名只差行业词/机构词（都归一到「${left.companyKey}」），城市与 ${salaryNote} 一致` +
        `，标题相似度 ${similarity.toFixed(2)} —— 疑似同一家的同一个岗位，未自动合并，建议人工确认`,
      score: similarity,
      candidate: true,
    }
  }
  if (similarity >= threshold) {
    return {
      merge: true,
      basis: `同公司 + 同城 + ${salaryNote}，标题相似度 ${similarity.toFixed(2)} ≥ ${String(threshold)}`,
      score: similarity,
      candidate: false,
    }
  }
  const candidate = similarity >= CANDIDATE_SIMILARITY
  return {
    merge: false,
    basis: candidate
      ? `同公司 + 同城 + ${salaryNote}，但标题相似度只有 ${similarity.toFixed(2)}（未达 ${String(threshold)}）—— 疑似跨平台重复，未自动合并，建议人工确认`
      : `键相同但标题相似度只有 ${similarity.toFixed(2)}，不合并`,
    score: similarity,
    candidate,
  }
}
