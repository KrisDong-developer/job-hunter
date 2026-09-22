/**
 * 采集条件 → **中文语义标签**（host 与 client 共用）。
 *
 * 存在的理由是一条实测的界面缺陷：方案列表原来直接渲染
 * `JSON.stringify(plan.criteria)` —— 用户看到的是 `{"keyword":"Java","city":"深圳"}`。
 * 那是**源码**，不是给求职者看的东西。
 *
 * 这一层是纯函数，所以模型工具的返回文本与界面上的文字必然一致
 * （与 `JOB_STATE_LABEL` 同样的理由：对话里说的和面板上写的必须是同一句话）。
 */

/** 一个条件的"人话"呈现。 */
export interface CriteriaItem {
  key: string
  /** 维度中文名，如"关键词"。 */
  label: string
  /** 原始值（用于编辑）。 */
  value: string
  /** 值的展示名：声明了取值域时用域里的 label（`2` → `最新发布`），否则就是原值。 */
  display: string
  /** 该维度是否被当前平台的适配器声明过（未声明的会在界面上显式标出）。 */
  declared: boolean
}

/**
 * 声明来源。刻意只要求"含这些字段"的最小形状，
 * 这样 `CriteriaDimensionDto`（客户端）与 `CriteriaDimension`（宿主）都能直接喂进来。
 */
export interface CriteriaDimensionLike {
  key: string
  label: string
  values: Array<{ value: string; label: string }>
}

/**
 * 兜底中文名。
 *
 * 为什么需要它：`criteriaDimensionsFor()` 只返回**当前选中平台**声明过的维度。
 * 如果一个方案引用了某个平台已经不支持的键（或方案正在编辑、平台刚被取消勾选），
 * 界面不该退回去印 `postedWithinDays`。已知的键在这里永远有中文名。
 *
 * ⚠️ 它同时是**宿主侧**那张"固定槽位表"（`ALL_DIMENSION_KEYS` 里谁都没声明的键）
 * 的中文名来源 —— 那几项也会出现在方案表单的「用不了的筛选」里，印出 `workExp`
 * 这种键名等于没说。所以这里的键必须覆盖两个来源的并集。
 */
export const FALLBACK_LABEL: Record<string, string> = {
  keyword: '关键词',
  city: '城市',
  sort: '排序方式',
  postedWithinDays: '发布时间',
  maxPages: '抓取页数上限',
  scrollRounds: '加载轮数',
  // 平台特有维度：只有部分平台声明（如神仙外企），但方案可能引用了它们，
  // 而平台刚被取消勾选 —— 那时候界面不该退回去印 `workExp`。
  //
  // ⚠️ 这张表必须**覆盖所有被适配器声明过的键**：漏一个，方案卡上的条件行就会
  // 印出源码里的键名（`businessCategory：30`）。`test/platform/dimension-namespace.test.ts`
  // 遍历全部适配器的声明来钉这条不变量。
  workExp: '工作经验',
  education: '学历',
  type: '职位范围',
  businessCategory: '行业',
  // ⚠️ 同一个键在两个平台含义不同（神仙外企 `companyTypeList`=美企/德企；51job `companyType`=国企/外资）——
  // 单平台方案里各自的声明会给出准确标签（DTO 的 label 来自那个适配器），这张**兜底表**
  // 只在"平台不明"时用（如方案卡），所以给一个两头都说得过去的合并名，而不是二选一。
  companyType: '公司性质 / 类型',
  companySize: '公司规模',
  posInfo: '职能',
  /** 国聘的 `major`（专业，独立于"行业类别"）。 */
  major: '专业',
  salaryRange: '薪资',
  experience: '经验',
  workNature: '工作性质',
  // ⚠️ 第二处同名不同义：`jobType` 在 SinoJobs 是"行业类别"（43 项），在 51job 是"职位类型"（全职/实习）。
  // 兜底表给合并名；单平台方案下用各自声明里的 label（那才是准的）。
  jobType: '职位类型 / 行业类别',
  degree: '学历',
  workYear: '工作经验',
  employment: '雇佣类型',
  workMode: '工作模式',
  // 智联的 `workExperience`（四位码 0103 = 1-3年）与 51job 的 `workYear` 是同一件事、
  // 键名不同 —— 这里同样只是兜底，单平台方案用的是各自声明里的 label。
  workExperience: '工作经验',
  /** 智联的 `jobStatus`（全职/兼职/实习/校园）—— 与 51job 的 `jobType` 语义相邻但不等价，故单列。 */
  jobStatus: '职位类型',
}

/** 数值型维度（展示时补单位，避免"3"这种光秃秃的数字）。 */
const NUMERIC_SUFFIX: Record<string, string> = {
  postedWithinDays: ' 天内',
  maxPages: ' 页',
  scrollRounds: ' 轮',
}

/** 把一份条件摊成人话；键顺序按声明顺序，未声明的排在后面。 */
export function describeCriteria(
  criteria: Record<string, string>,
  dimensions: readonly CriteriaDimensionLike[] = [],
): CriteriaItem[] {
  const declared = new Map(dimensions.map((dimension) => [dimension.key, dimension]))
  const order = [
    ...dimensions.map((dimension) => dimension.key).filter((key) => key in criteria),
    ...Object.keys(criteria).filter((key) => !declared.has(key)),
  ]

  const seen = new Set<string>()
  const items: CriteriaItem[] = []
  for (const key of order) {
    if (seen.has(key)) continue
    seen.add(key)
    const value = criteria[key]
    if (value === undefined || value === '') continue
    const spec = declared.get(key)
    const suffix = NUMERIC_SUFFIX[key] ?? ''
    const inDomain = spec?.values.find((option) => option.value === value)
    items.push({
      key,
      label: spec?.label ?? FALLBACK_LABEL[key] ?? key,
      value,
      display: inDomain === undefined ? `${value}${suffix}` : inDomain.label,
      declared: spec !== undefined,
    })
  }
  return items
}

/** 一行文本，例如 `关键词：Java · 城市：深圳`。空条件返回 `null`（界面据此显示"不限"）。 */
export function formatCriteriaLine(
  criteria: Record<string, string>,
  dimensions: readonly CriteriaDimensionLike[] = [],
  separator = ' · ',
): string | null {
  const items = describeCriteria(criteria, dimensions)
  if (items.length === 0) return null
  return items.map((item) => `${item.label}：${item.display}`).join(separator)
}
