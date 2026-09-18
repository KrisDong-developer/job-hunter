/**
 * 适配器配置的**通用覆盖合并**（批次 6 的"共享构造样板"）。
 *
 * ## 为什么值得抽出来
 *
 * 每个适配器都有一个 `merge*Config(override)`，把 DB 里那份覆盖
 * （`setting(key='adapter-config', scope='platform')`）叠在内置默认值上。
 * 10 份实现写的是**同一套语义**，但每一份都可能在某次改动里漏掉一条规则
 * （比如忘了"空串视为没改"），而这种漏掉只会以"某个平台的配置突然被清空"
 * 的形式出现 —— 极难归因。集中一处之后，规则只有一份。
 *
 * ## 复刻的四条语义（与 51job 的旧实现逐条对齐）
 *
 *   1. **分组浅合并**：`selectors` / `urlParams` / `cityCodes` 这类分组，
 *      覆盖里出现的键生效，没出现的沿用默认；
 *   2. **字符串空值保护**：覆盖给的是空串时**视为没改** ——
 *      界面上清空一个输入框，不该让必填字段变成空串（那会让整页解析崩掉）；
 *   3. **顶层只认 base 里已有的键**：覆盖里多出来的**顶层**键被**丢弃**。
 *      这是一条**安全性质**而不只是洁癖：DB 里拼错一个顶层键名
 *      （`selector` 少个 s）应当静默无效，而不是往配置里塞进一个从未被读过的字段；
 *   4. **分组内的新键保留**（`{...base, ...patch}` 的直接结果）。
 *      这条**必须**保留：给 `cityCodes` 覆盖加一个内置表里没有的城市，
 *      正是靠它 —— 把分组内也做成白名单，会让"用 DB 补城市码"这条路直接断掉。
 *      所以"白名单"只针对顶层，分组内是普通的浅合并；
 *   5. **整体不是对象 → 原样返回默认值**（DB 里存了 `null` / 数组 / 字符串也不崩）。
 *
 * ## 数组为什么整体替换
 *
 * 按索引合并数组从来不是想要的语义：`['a','b']` 叠上 `['c']` 得到
 * `['c','b']` 只会在"想换掉整份列表"时把人绕晕。要改列表就整份给。
 */

/** 是不是"普通对象"（用于判断"这是一个可合并的分组"）。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 把 `override` 合并到 `base` 上，返回一份**新对象**（不改动入参）。
 *
 * 泛型用 `T extends object` 而不是 `Record<string, unknown>`：
 * TS 里 `interface` 不带隐式索引签名，写成后者会让所有适配器配置类型都传不进来。
 */
export function mergeAdapterConfig<T extends object>(base: T, override: unknown): T {
  if (!isPlainObject(override)) return base
  const out: Record<string, unknown> = {}
  for (const [key, baseValue] of Object.entries(base)) {
    const patchValue = (override as Record<string, unknown>)[key]
    if (patchValue === undefined) {
      out[key] = baseValue
      continue
    }
    if (Array.isArray(baseValue)) {
      out[key] = patchValue
      continue
    }
    if (isPlainObject(baseValue) && isPlainObject(patchValue)) {
      out[key] = { ...baseValue, ...patchValue }
      continue
    }
    if (typeof baseValue === 'string') {
      // 空串 = "没改"（界面清空输入框不该把必填字段清掉）
      out[key] = typeof patchValue === 'string' && patchValue !== '' ? patchValue : baseValue
      continue
    }
    // 标量：类型对得上才接受，对不上就沿用默认值（DB 里的脏值不该改变行为）
    out[key] = typeof patchValue === typeof baseValue ? patchValue : baseValue
  }
  return out as T
}
