// 采集方案的「方案编辑弹窗」：分步向导（基础与平台 / 采集与筛选 / 调度与后处理）。
// 从 collect.tsx 原样搬出，行为未变 —— PLAN_STEPS / PRIMARY_CRITERIA_KEYS /
// platformHintOf / limitTextOf 都是本模块私有，对外只导出 PlanEditorModal。
// 表单形状与换算（PlanForm / parseKeywordsText / writeOf）来自同目录的 plan-form。

import { Fragment, useEffect, useRef, useState } from 'react'
import { AUTH_REQUIREMENT_LABEL, MATURITY_LEVEL_LABEL, MATURITY_LEVEL_SHORT, MATURITY_LEVEL_TONE } from '../../../shared/contract/enums/platform.js'
import { PLAN_KEYWORDS_MAX } from '../../../shared/config/crawl.js'
import { WEEKDAY_PRESETS, formatWeekdays, formatWindow, parseClockValue } from '../../../shared/text/time-format.js'
import { ApiError } from '../../net/client.js'
import { fetchCriteriaDimensions } from '../../net/collect/plans.js'
import type { CriteriaDimensionDto, PlanDuplicateDto } from '../../../shared/contract/dto/plan.js'
import type { PlatformOverviewDto } from '../../../shared/contract/dto/platform.js'
import { useAsync } from '../../hooks/use-async.js'
import { FieldHint } from '../../ui/field-hint.js'
import { Modal } from '../../ui/modal.js'
import type { PlanForm } from './plan-form.js'
import { parseKeywordsText, writeOf } from './plan-form.js'

/** 分步弹窗的三步（分步条与"下一步"的文案共用这一份，不各写一遍）。 */
const PLAN_STEPS = ['基础与平台', '采集与筛选', '调度与后处理'] as const

/**
 * 第 2 步里默认**摊在明面上**的筛选维度。
 *
 * 判据是"改方案时最常动的几个"。`keyword` **刻意不在维度网格里** —— 它升级成了
 * 方案级多关键词（每行一个），有自己的专属输入区，网格里再出现一个单值输入
 * 只会造成"两处都能配关键词"的歧义。
 * 其余维度（排序方式 / 发布时间 / 职位范围 / 各平台特有维度）默认值几乎都是"不限"，
 * 十来个下拉框全摊出来只会把上面这几个淹掉 —— 评审原话："中间 15+ 个下拉框大部分默认不限，
 * 极占空间"。所以它们进「高级筛选」折叠区。
 *
 * ⚠️ 放进折叠区**不等于**隐藏：不支持的维度仍然会渲染（禁用 + 写明原因），
 * 折叠区里有生效值时还会自动展开并把项数写在折叠开关上。
 */
const PRIMARY_CRITERIA_KEYS: readonly string[] = [
  'city',
  'workExp',
  'education',
  'salaryRange',
]

/**
 * 表格「平台」列里问号的内容：**一个平台的静态事实**。
 *
 * 这些是"点开之前就该知道"的东西 —— 成熟度缺口（`notes` 里写着已知陷阱）、
 * 上次真机验证日期、三个环节各自的登录要求。原来它们只出现在保存后的提示里
 * （也就是**配置完才看到**），现在放在平台名字旁边，选之前就能看。
 */
function platformHintOf(item: PlatformOverviewDto): string {
  const parts = [`${item.displayName}（${item.id}）`, MATURITY_LEVEL_LABEL[item.maturity.level]]
  if (item.maturity.verifiedAt !== null) parts.push(`上次真机验证 ${item.maturity.verifiedAt}`)
  if (item.maturity.notes !== undefined && item.maturity.notes !== '') parts.push(item.maturity.notes)
  parts.push(
    '登录要求：' +
      `抓取${AUTH_REQUIREMENT_LABEL[item.authRequirement.crawl]}、` +
      `详情${AUTH_REQUIREMENT_LABEL[item.authRequirement.detail]}、` +
      `动作${AUTH_REQUIREMENT_LABEL[item.authRequirement.actions]}`,
  )
  return parts.join('；')
}

/**
 * 表格「限制」列的短文案。
 *
 * 只放**一眼要用的两条**：页数上限（超了保存会直接被拒）与"抓取要不要登录"。
 * 完整说明在平台名旁的问号里 —— 表格单元格塞长段文字正是评审要消掉的那种噪音。
 */
function limitTextOf(item: PlatformOverviewDto): string {
  // 拦一道版本错位：宿主半改了 `maxPages` 而 DSH 没重启时，这个字段会是 undefined。
  // 那种情况下宁可不写页数，也不要印出"最多 undefined 页"（OPTIMIZATION-PLAN §1.2 第 9 条：
  // 改宿主半必须重启 DSH —— 界面这一侧不该因此说假话）。
  const parts = Number.isFinite(item.maxPages) ? [`最多 ${String(item.maxPages)} 页`] : []
  const crawl = item.authRequirement.crawl
  if (crawl === 'required') parts.push('抓取需登录')
  else if (crawl === 'unknown') parts.push('抓取登录未验证')
  return parts.join(' · ')
}

/**
 * 方案编辑器（**分步弹窗**）。
 *
 * ## 这一版针对"信息密度极低、平铺堆砌"的评审改了什么
 *
 * 一条一句，对应评审的四条：
 *   * **分步**：一个弹窗无限往下滚 → 三步（基础与平台 / 采集与筛选 / 调度与后处理），
 *     底栏吸底，只有主体滚动；
 *   * **平台表格化**：原来"上面勾一遍平台、下面再把每个平台列一遍填页数" → 一张表
 *     （勾选 / 平台 / 状态 / 页数上限 / 限制），带全选与批量设置；
 *   * **降噪**：底部那坨"· 提示一 · 提示二"的棕色文字瀑布 → 顶部一个可收起的
 *     「配置须知」+ 逐条一行的提示列表；平台自己的限制就近放进表格的 `?` 与「限制」列；
 *   * **控件标准化**：「检查」从漂在输入框旁边的按钮 → 输入框的**后缀按钮**（并在失焦时
 *     自动校验）；运行日与时段同一行对齐。
 *
 * 刻意**没有**改的：校验规则（仍然只在 host 那一份 `validatePlanConfig` 里）、
 * 表单到写入体的转换（`writeOf`）、以及"有重复/提示就不自动关窗"的行为。
 * 界面能拦下的（方案名为空、没选平台、平台全被暂停）与接口报的是**同一套**判据 ——
 * 拦在这里只是省一趟必失败的网络往返，不是另立一套规则。
 */
export function PlanEditorModal(props: {
  planId: number | null
  initial: PlanForm
  /** 已注册平台的**概览**（含成熟度 / 登录要求 / 页数上限 —— 表格的三列全靠它）。 */
  available: PlatformOverviewDto[]
  duplicates: PlanDuplicateDto[]
  /** 非致命提示（多平台：城市不支持 / 平台未校准 / 深度被截断）。 */
  notices: string[]
  running: boolean
  onCancel(): void
  onSubmit(form: PlanForm): Promise<void>
  onValidate(form: PlanForm): Promise<{ duplicates: PlanDuplicateDto[]; notices: string[] }>
}) {
  const [form, setForm] = useState<PlanForm>(props.initial)
  const [localDuplicates, setLocalDuplicates] = useState<PlanDuplicateDto[]>([])
  const [localNotices, setLocalNotices] = useState<string[]>([])
  /** 当前步骤（0/1/2）。步骤本身不落库，切走就没了 —— 它只是"怎么填"的组织方式。 */
  const [step, setStep] = useState(0)
  /** 「配置须知」默认**收起**：它每次都出现，展开就等于每次弹窗都先挡一段说明。 */
  const [rulesOpen, setRulesOpen] = useState(false)
  /** 「高级筛选」展开态；有生效值时会被下面的 effect 强制展开（折叠的条件不能变成隐形条件）。 */
  const [advancedOpen, setAdvancedOpen] = useState(false)
  /** 批量设置页数用的输入值（不落库，只作用于一次点击）。 */
  const [batchPages, setBatchPages] = useState('5')
  const allBoxRef = useRef<HTMLInputElement>(null)
  /** 正在保存（本弹窗自己的，不含页面级那一条反馈）。 */
  const [submitting, setSubmitting] = useState(false)
  /** 保存失败的原因，**就地**显示。 */
  const [submitError, setSubmitError] = useState<string | null>(null)
  /**
   * 最后一次成功保存的回执：写入体 + 当时的方案名。
   *
   * 为什么要这么一个状态：父组件在**有重复或提示时刻意不关窗**（提示不能被一起关掉），
   * 而新建方案的默认值是"全平台"，其中实验/停用档的平台必然带来提示 —— 于是
   * "保存成功"与"按钮没反应"在界面上一模一样（防抖校验早就把同一批提示画在顶部了，
   * 保存成功不产生任何视觉变化）。用户接着自然会再点一次，那会在库里多出一个同名方案。
   * 所以成功后就地给回执，并在内容没变时把按钮换成「已保存」——
   * 改动任何一项立刻变回「保存」，不会挡住"改了再存"。
   */
  const [receipt, setReceipt] = useState<{ body: string; name: string } | null>(null)

  const patch = (next: Partial<PlanForm>): void => setForm((current) => ({ ...current, ...next }))

  /**
   * 总残留重复 = 保存接口返回的 + 本地实时校验得到的，**按方案 id 收敛**。
   *
   * 不收敛的话：保存成功后父组件把接口返回的那一份塞进来，而防抖校验刚刚也
   * 算出了同样的一条 —— 同一个重复项会渲染两遍，两遍还撞同一个 React key。
   */
  const duplicates = [
    ...new Map(
      [...props.duplicates, ...localDuplicates].map((item) => [item.planId, item]),
    ).values(),
  ]
  // 提示同理：保存后拿到一次，编辑过程中由防抖校验持续刷新 —— 这样"选了国聘 + 成都"
  // 在**保存之前**就看得见"它会返回空"，而不是等抓完 0 条才发现。
  const notices = [...new Set([...props.notices, ...localNotices])]
  const startClock = parseClockValue(form.windowStart)
  const endClock = parseClockValue(form.windowEnd)
  const startMissing = startClock === null
  const endMissing = endClock === null

  /**
   * 实时查重（防抖）：平台/筛选条件一改就自动校验，不用再手动点「检查是否重复」。
   * 只对**真正影响查重**的输入做键，避免每次敲字都触发。
   */
  // 覆盖项也进键：改"停用某个平台"或"它的页数"时，提示（如"深度被截断"）要跟着重算。
  // 关键词同理 —— 宿主的查重口径里关键词是**参与比较**的（多关键词方案之间
  // "同样的平台 + 同样的条件 + 同样的关键词"才算重复），不进键就会拿着一份旧结论。
  const keywordsKey = JSON.stringify(parseKeywordsText(form.keywordsText))
  const validationKey = `${form.platforms.join(',')}\u0000${JSON.stringify(form.overrides)}\u0000${JSON.stringify(form.criteria)}\u0000${keywordsKey}`
  useEffect(() => {
    // 新建方案也走这条（`POST /plans/validate`）—— "选了国聘 + 成都"要能在保存前就看见。
    const timer = window.setTimeout(() => {
      void props
        .onValidate(form)
        .then((result) => {
          setLocalDuplicates(result.duplicates)
          setLocalNotices(result.notices)
        })
        .catch(() => {
          setLocalDuplicates([])
          setLocalNotices([])
        })
    }, 600)
    return () => window.clearTimeout(timer)
    // form 是当前渲染的引用；依赖只在查重语义变化时更新，见上方 validationKey。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validationKey, props.planId])

  const dimensions = useAsync(
    (signal) => fetchCriteriaDimensions(form.platforms, signal),
    [form.platforms.join(',')],
  )
  const items: CriteriaDimensionDto[] = dimensions.state.status === 'ok' ? dimensions.state.data.items : []

  const togglePlatform = (id: string): void => {
    const has = form.platforms.includes(id)
    const nextPlatforms = has ? form.platforms.filter((item) => item !== id) : [...form.platforms, id]
    // 覆盖项跟着平台集合走：加入时补一条默认（否则那一行没有初值），
    // 移除时**同时删掉**它的覆盖项（留着它会在重新加入时静默生效）。
    const nextOverrides = { ...form.overrides }
    if (has) delete nextOverrides[id]
    else nextOverrides[id] = { enabled: true, maxPages: '' }
    patch({ platforms: nextPlatforms, overrides: nextOverrides })
  }

  const setOverride = (id: string, next: Partial<{ enabled: boolean; maxPages: string }>): void => {
    const current = form.overrides[id] ?? { enabled: true, maxPages: '' }
    patch({ overrides: { ...form.overrides, [id]: { ...current, ...next } } })
  }

  const setCriteria = (key: string, value: string): void => {
    const next = { ...form.criteria }
    if (value === '') delete next[key]
    else next[key] = value
    patch({ criteria: next })
  }

  /**
   * 手动 / 失焦触发一次校验。
   *
   * 防抖那条只看平台与条件（改方案名不会触发），所以"检查"这个动作还得留着。
   * 评审提的是"按钮与输入框脱节"，所以这里做两件事：
   *   ① 把它做成输入框的**后缀按钮**（视觉上是同一个控件，见 .jh-affix）；
   *   ② 挂在输入框的 `onBlur` 上 —— 改完名字一离开就自动查一次，多数情况下根本不用点它。
   */
  const check = (): void => {
    void props
      .onValidate(form)
      .then((result) => {
        setLocalDuplicates(result.duplicates)
        setLocalNotices(result.notices)
      })
      .catch(() => {
        setLocalDuplicates([])
        setLocalNotices([])
      })
  }

  /**
   * 当前表单的写入体指纹（`writeOf` 的结果，含时间解析兜底，所以稳定）。
   * 只用来判断"自上次保存之后改过没有"。
   */
  const bodyKey = JSON.stringify(writeOf(form))
  const unchangedSinceSave = receipt !== null && receipt.body === bodyKey
  const busy = submitting || props.running

  /**
   * 保存。**失败必须就地显示**。
   *
   * 原来失败只走页面级那条 `feedback`（`report()`），而它在弹窗遮罩后面 ——
   * 用户看到的就是"点了保存没反应"。所以父组件改成把错误抛回来，由这里画在
   * 弹窗顶部（紧挨着保存按钮那一侧）。
   */
  const submit = async (): Promise<void> => {
    // 再挡一道：按钮的 disabled 要等一次重渲染才生效，而"保存"按两次的代价是
    // 库里多出一个同名方案（不是一次无害的重复请求）。
    if (busy || unchangedSinceSave) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await props.onSubmit(form)
      setReceipt({ body: bodyKey, name: form.name.trim() })
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.display : String(error))
    } finally {
      setSubmitting(false)
    }
  }

  // ── 第 1 步的门槛：与 `validatePlanConfig` 的三条硬性判据**一一对应** ──────────
  // 拦在这里只是省一趟必然失败的网络往返，不是另立一套规则。
  const includedCount = form.platforms.length
  const enabledCount = form.platforms.filter(
    (id) => (form.overrides[id] ?? { enabled: true }).enabled,
  ).length
  const nameMissing = form.name.trim() === ''
  const stepOneBlocked = nameMissing || includedCount === 0 || enabledCount === 0
  const planPages = form.criteria['maxPages'] ?? ''
  /** 生效关键词数（清洗后）；超上限 → 保存按钮置灰并就地说明（判据与宿主一致）。 */
  const keywordCount = parseKeywordsText(form.keywordsText).length
  const keywordsOverCap = keywordCount > PLAN_KEYWORDS_MAX

  // 方案级页数上限在第 1 步与平台表挨着呈现，所以从第 2 步的维度网格里摘出去 ——
  // 同一个输入出现在两处，正是评审要消掉的那种重复。
  // keyword 同理：它升级成了下面的多关键词输入区，网格里不再出现。
  const pagesDimension = items.find((item) => item.key === 'maxPages')
  const filterItems = items.filter((item) => item.key !== 'maxPages' && item.key !== 'keyword')
  const primaryItems = filterItems.filter(
    (item) => item.supported && PRIMARY_CRITERIA_KEYS.includes(item.key),
  )
  const primaryKeys = new Set(primaryItems.map((item) => item.key))
  // 不支持的维度一律留在高级区（禁用 + 写明原因），所以"只有支持的才进高频区"
  // 不会把任何一个维度藏起来。
  const advancedItems = filterItems.filter((item) => !primaryKeys.has(item.key))
  const advancedActiveCount = advancedItems.filter(
    (item) => (form.criteria[item.key] ?? '') !== '',
  ).length
  const advancedNames =
    advancedItems
      .filter((item) => item.supported)
      .map((item) => item.label)
      .slice(0, 4)
      .join(' / ') || '排序方式 / 发布时间 / 平台特有维度'

  useEffect(() => {
    // 高级区里有生效值就必须展开：折叠的条件不能变成隐形条件（与岗位库同一条判据）。
    if (advancedActiveCount > 0) setAdvancedOpen(true)
  }, [advancedActiveCount])

  const allIncluded = includedCount > 0 && includedCount === props.available.length
  useEffect(() => {
    // 半选态只能通过 DOM 属性表达（React 没有对应的 prop），所以跟着渲染同步一次。
    const box = allBoxRef.current
    if (box !== null) box.indeterminate = includedCount > 0 && !allIncluded
  }, [includedCount, allIncluded])

  const toggleAll = (): void => {
    if (allIncluded) {
      patch({ platforms: [], overrides: {} })
      return
    }
    // 保留已经配过的覆盖项：全选不该把"某个平台单独设的页数/暂停"抹掉。
    const nextOverrides: Record<string, { enabled: boolean; maxPages: string }> = {}
    for (const item of props.available) {
      nextOverrides[item.id] = form.overrides[item.id] ?? { enabled: true, maxPages: '' }
    }
    patch({ platforms: props.available.map((item) => item.id), overrides: nextOverrides })
  }

  /**
   * 批量设置页数上限（评审："支持顶部批量设置选中平台页数上限"）。
   *
   * **超过平台自己上限的按该平台上限填写**，而不是静默截断：工具栏上就写着这条，
   * 表格里的数字也会当场变成那个上限，而「限制」列本来就写着"最多 N 页"。
   * 不这么做的话，一次批量设置会造出若干条保存时必然被拒的配置（guopin / waiqi / zhipin
   * 都只有 1 页，不是边角情况）。
   */
  const applyBatchPages = (): void => {
    const parsed = Number.parseInt(batchPages, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    const nextOverrides = { ...form.overrides }
    for (const item of props.available) {
      if (!form.platforms.includes(item.id)) continue
      const current = nextOverrides[item.id] ?? { enabled: true, maxPages: '' }
      // 拿不到平台上限时（版本错位）不收敛、也不写 NaN —— 就按用户填的值写下去。
      const cap = Number.isFinite(item.maxPages) ? item.maxPages : parsed
      nextOverrides[item.id] = { ...current, maxPages: String(Math.min(parsed, cap)) }
    }
    patch({ overrides: nextOverrides })
  }

  /**
   * 渲染一个筛选维度（高频区与高级区共用同一份）。
   *
   * 不支持的维度**仍然渲染**（禁用 + 写明原因）—— 这是本项目一贯的做法：
   * 隐藏会让用户以为功能坏了（§5.5 能力驱动的 UI）。所以"进折叠区"不等于"藏起来"。
   */
  const renderDimension = (dimension: CriteriaDimensionDto) => {
    const value = form.criteria[dimension.key] ?? ''
    const hint = dimension.supported ? dimension.hint : (dimension.disabledReason ?? dimension.hint)
    /**
     * 控件一律写**显式** `aria-label`，不靠外层 `<label>` 的隐式关联。
     *
     * 因为 `FieldHint` 折叠时把说明文字放在 `.jh-sr-only` 里（仍然在无障碍树里，
     * 否则读屏拿不到全文），而那些文字是 `<label>` 的文本内容的一部分 ——
     * 隐式关联会把字段名变成「城市 + 当前平台不支持 + 说明全文」，
     * 读屏要念一大段才轮到"编辑框"。显式命名把可访问名收回成维度自己的名字。
     */
    return (
      <label className="jh-field" key={dimension.key}>
        <span className="jh-field-label">
          {dimension.label}
          {dimension.supported ? null : <em className="jh-field-flag">当前平台不支持</em>}
          <FieldHint text={hint} />
        </span>
        {dimension.numeric ? (
          <input
            className="jh-input"
            type="number"
            min={1}
            max={dimension.max ?? undefined}
            disabled={!dimension.supported}
            value={value}
            aria-label={dimension.label}
            placeholder={dimension.supported ? '不限' : '不支持'}
            onChange={(event) => setCriteria(dimension.key, event.target.value)}
          />
        ) : dimension.values.length === 0 ? (
          <input
            className="jh-input"
            disabled={!dimension.supported}
            value={value}
            aria-label={dimension.label}
            placeholder={dimension.supported ? '不限' : '不支持'}
            onChange={(event) => setCriteria(dimension.key, event.target.value)}
          />
        ) : (
          <select
            className="jh-select"
            disabled={!dimension.supported}
            value={value}
            aria-label={dimension.label}
            onChange={(event) => setCriteria(dimension.key, event.target.value)}
          >
            <option value="">不限</option>
            {dimension.values.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </label>
    )
  }

  return (
    <Modal
      title={props.planId === null ? '新增采集方案' : '编辑采集方案'}
      label="采集方案"
      size="lg"
      onClose={props.onCancel}
      footer={
        <>
          {step === 0 ? null : (
            <button type="button" className="jh-btn jh-btn-inline" onClick={() => setStep(step - 1)}>
              上一步
            </button>
          )}
          <span className="jh-spacer" />
          <button type="button" className="jh-btn jh-btn-inline" onClick={props.onCancel}>
            取消
          </button>
          {step < PLAN_STEPS.length - 1 ? (
            <button
              type="button"
              className="jh-btn jh-btn-inline jh-btn-primary"
              disabled={busy || (step === 0 && stepOneBlocked)}
              title={
                step === 0 && stepOneBlocked
                  ? '先填方案名，并至少纳入一个未暂停的平台。'
                  : `下一步：${PLAN_STEPS[step + 1] ?? ''}`
              }
              onClick={() => setStep(step + 1)}
            >
              下一步
            </button>
          ) : (
            <button
              type="button"
              className="jh-btn jh-btn-inline jh-btn-primary"
              disabled={busy || stepOneBlocked || keywordsOverCap || unchangedSinceSave}
              title={
                stepOneBlocked
                  ? '方案名不能为空，且至少要有一个未暂停的平台 —— 与保存接口的判据一致。'
                  : keywordsOverCap
                    ? `关键词超过上限 ${String(PLAN_KEYWORDS_MAX)} 个 —— 到「采集与筛选」步骤改。`
                    : unchangedSinceSave
                      ? '当前内容与上次保存的一致；改动任何一项后可以再次保存。'
                      : busy
                        ? '正在保存，请稍候。'
                        : '保存这个方案。'
              }
              onClick={() => void submit()}
            >
              {unchangedSinceSave ? '已保存' : busy ? '正在保存…' : '保存'}
            </button>
          )}
        </>
      }
    >
      {/* 分步条：**可点**（回看已配的部分不必先点"上一步"）。
          第 2/3 步在门槛未过时禁用 —— 没选平台就进"筛选条件"，那里一片"不支持"。 */}
      <nav className="jh-steps" aria-label="方案配置步骤">
        {PLAN_STEPS.map((label, index) => (
          <Fragment key={label}>
            {index === 0 ? null : (
              <span className="jh-step-sep" aria-hidden="true">
                ›
              </span>
            )}
            <button
              type="button"
              className={`jh-step${index === step ? ' jh-step-on' : ''}`}
              aria-current={index === step ? 'step' : undefined}
              disabled={index > 0 && stepOneBlocked}
              title={
                index > 0 && stepOneBlocked
                  ? '先填方案名，并至少纳入一个未暂停的平台。'
                  : `第 ${String(index + 1)} 步：${label}`
              }
              onClick={() => setStep(index)}
            >
              <span className="jh-step-no" aria-hidden="true">
                {index + 1}
              </span>
              {label}
            </button>
          </Fragment>
        ))}
      </nav>

      {/* 全局规则：按评审要求用**标准轻量 Alert**（.jh-alert-quiet）放在弹窗顶部，可收起。
          原来它是底栏右侧那半句话 —— 而底栏现在只剩按钮。 */}
      <div className="jh-alert jh-alert-quiet">
        <button
          type="button"
          className="jh-plan-toggle"
          aria-expanded={rulesOpen}
          aria-controls="jh-plan-rules"
          onClick={() => setRulesOpen((open) => !open)}
        >
          <span className="jh-plan-caret" aria-hidden="true">
            {rulesOpen ? '▾' : '▸'}
          </span>
          <span className="jh-plan-toggle-text">配置须知</span>
          <span className="jh-filter-note">保存前按同一套规则校验 · 平台自身的限制见下表「限制」列</span>
        </button>
        <div className="jh-plan-panel" id="jh-plan-rules" hidden={!rulesOpen}>
          <ul className="jh-alert-list">
            <li>
              保存前会按与模型工具、接口<strong>同一套</strong>规则校验；不合法直接报错、不入库。
            </li>
            <li>
              页数上限按<strong>每个平台自己</strong>的上限校验（见「限制」列）。给某个平台单独填的页数
              只作用于它；留空则用第 1 步的方案级页数。
            </li>
            <li>
              筛选条件按<strong>已纳入且未暂停</strong>的平台校验 —— 某个平台不认的条件会被拒绝，
              而不是静默忽略。
            </li>
            <li>
              定时时段只在区间内随机取点，不固定到某一分钟：固定时刻最容易被平台识别成自动化。
            </li>
          </ul>
        </div>
      </div>

      {/* 保存结果：**必须画在弹窗里**。原来它只走页面级那条反馈，而那条在遮罩后面 ——
          保存成功、失败、进行中三种情况在用户眼里都是"点了没反应"。 */}
      {submitError === null ? null : (
        <div className="jh-alert jh-alert-error" role="alert">
          <div className="jh-alert-head">
            <span className="jh-alert-title">保存失败</span>
            <span className="jh-muted">没有写入任何东西；按下面的原因改完可以直接重试。</span>
          </div>
          <p className="jh-alert-body">{submitError}</p>
        </div>
      )}
      {receipt === null || !unchangedSinceSave ? null : (
        <div className="jh-alert" role="status">
          <div className="jh-alert-head">
            <span className="jh-alert-title">已保存方案「{receipt.name}」</span>
            <span className="jh-muted">改动任何一项后「保存」会重新可用。</span>
          </div>
        </div>
      )}

      {/* 当前配置的提示：**就近放在顶部、一条一行**。旧版是堆在弹窗最底部的一大段棕色文字
          （评审原话"文字瀑布"），而且用户要填完最后一个字段才看得到它。 */}
      {duplicates.length === 0 && notices.length === 0 ? null : (
        <div
          className={`jh-alert ${duplicates.length > 0 ? 'jh-alert-warn' : 'jh-alert-quiet'}`}
          role="status"
        >
          <div className="jh-alert-head">
            <span className="jh-alert-title">
              {[
                duplicates.length > 0 ? `与 ${String(duplicates.length)} 个方案条件重复` : null,
                notices.length > 0 ? `${String(notices.length)} 条提示` : null,
              ]
                .filter((part) => part !== null)
                .join(' · ')}
            </span>
            <span className="jh-muted">只提示，仍可保存</span>
          </div>
          <ul className="jh-alert-list">
            {duplicates.map((item) => (
              <li key={`dup-${String(item.planId)}`}>
                与 #{item.planId}「{item.name}」条件重复（{item.reason}）—— 不会自动合并。
              </li>
            ))}
            {notices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="jh-step-body">
        {step === 0 ? (
          <>
            {/* 方案名 + 检查：它校验的就是"这份配置是否重复"，所以贴成输入框的**后缀按钮** */}
            <div className="jh-field">
              {/* 用 <label htmlFor> 而不是旁边的 <span>：本屏只有这一个字段是**必填**的
                  （空名字会被 `validatePlanConfig` 直接拒），而原来它没有可访问名 ——
                  读屏聚焦到这个框只会念"编辑框"，不知道要填什么。 */}
              <label className="jh-field-label" htmlFor="jh-plan-name">
                方案名
              </label>
              <div className="jh-affix">
                <input
                  id="jh-plan-name"
                  className="jh-input"
                  value={form.name}
                  aria-invalid={nameMissing}
                  onChange={(event) => patch({ name: event.target.value })}
                  onBlur={check}
                />
                <button
                  type="button"
                  className="jh-btn jh-affix-btn"
                  disabled={props.running}
                  title="检查这份配置（平台 + 筛选条件）是否与现有方案重复、以及哪些平台会返回空。只提示，不会写入任何东西。"
                  onClick={check}
                >
                  检查
                </button>
              </div>
              {nameMissing ? (
                <span className="jh-warn" role="alert">
                  方案名不能为空。
                </span>
              ) : null}
            </div>

            <div className="jh-section-title">目标平台与页数</div>

            {props.available.length === 0 ? (
              <p className="jh-muted">还没有已注册的平台。</p>
            ) : (
              <>
                {/* 方案级页数：只作用于**没单独填页数**的平台。方案级表达不了"某个平台
                    只支持 1 页"，所以逐平台的覆盖项才是精确的那一层（见下表）。 */}
                {pagesDimension === undefined || !pagesDimension.supported ? null : (
                  <div className="jh-field">
                    <span className="jh-field-label">
                      抓取页数上限（方案级）
                      <FieldHint
                        text={`${pagesDimension.hint} 单个平台可在下表单独填，填了就用它。留空则各平台按自己的默认页数抓；超过某个平台自身上限的部分对它无效，保存前会提示。`}
                      />
                    </span>
                    <div className="jh-field-row">
                      <input
                        className="jh-input jh-input-narrow"
                        type="number"
                        min={1}
                        placeholder="默认"
                        aria-label="方案级抓取页数上限"
                        value={planPages}
                        onChange={(event) => setCriteria('maxPages', event.target.value)}
                      />
                      <span className="jh-muted">页 —— 留空则各平台按自己的默认页数抓</span>
                    </div>
                  </div>
                )}

                {/* 表格工具条：全选在左（与"已勾选的行"贴在一起），批量设置在右 */}
                <div className="jh-batch">
                  <label className="jh-check">
                    <input
                      ref={allBoxRef}
                      type="checkbox"
                      checked={allIncluded}
                      onChange={toggleAll}
                    />
                    全选
                  </label>
                  <span className="jh-muted">
                    已纳入 {includedCount} / {props.available.length} 个平台
                    {enabledCount === includedCount
                      ? ''
                      : `（其中 ${String(includedCount - enabledCount)} 个已暂停）`}
                  </span>
                  <span className="jh-spacer" />
                  <label className="jh-muted" htmlFor="jh-batch-pages">
                    批量设置页数上限
                  </label>
                  <input
                    id="jh-batch-pages"
                    className="jh-input"
                    type="number"
                    min={1}
                    value={batchPages}
                    onChange={(event) => setBatchPages(event.target.value)}
                  />
                  <button
                    type="button"
                    className="jh-btn jh-btn-inline jh-btn-tiny"
                    disabled={includedCount === 0}
                    title="给所有已纳入的平台填上同一个页数上限。超过平台自身上限的按该平台上限填写。"
                    onClick={applyBatchPages}
                  >
                    应用
                  </button>
                </div>
                <p className="jh-filter-note">
                  超过平台自身上限的按该平台上限填写；页数留空的平台用上面的方案级页数。
                </p>

                <div className="jh-table-scroll">
                  <table className="jh-table jh-table-plan jh-table-roomy">
                    <thead>
                      <tr>
                        <th scope="col" className="jh-col-check">
                          <span className="jh-sr-only">纳入方案</span>
                        </th>
                        <th scope="col">平台</th>
                        <th scope="col">状态</th>
                        <th scope="col">页数上限</th>
                        <th scope="col">限制</th>
                      </tr>
                    </thead>
                    <tbody>
                      {props.available.map((item) => {
                        const included = form.platforms.includes(item.id)
                        const entry = form.overrides[item.id] ?? { enabled: true, maxPages: '' }
                        // 至少留一个启用的平台：全暂停等于"这个方案永远不抓任何东西"，
                        // 而 `validatePlanConfig` 会因此直接拒绝保存 —— 与其让用户点两次
                        // 才知道，不如把最后一个"暂停"按禁掉并说明原因。
                        const lastEnabled = included && entry.enabled && enabledCount === 1
                        // 超过这个平台自己的上限 → 保存必被拒（`validatePlanConfig` 按**每个平台
                        // 各自**的 maxPages 校验）。这里先说出来，省一趟必然失败的往返。
                        const overCap =
                          entry.maxPages.trim() !== '' && Number(entry.maxPages) > item.maxPages
                        return (
                          <tr key={item.id}>
                            <td className="jh-col-check">
                              <input
                                type="checkbox"
                                checked={included}
                                aria-label={`纳入 ${item.displayName}`}
                                onChange={() => togglePlatform(item.id)}
                              />
                            </td>
                            <td>
                              {item.displayName}
                              <FieldHint text={platformHintOf(item)} />
                            </td>
                            <td>
                              <span
                                className={`jh-tag jh-tone-${MATURITY_LEVEL_TONE[item.maturity.level]}`}
                              >
                                {MATURITY_LEVEL_SHORT[item.maturity.level]}
                              </span>
                              {included && !entry.enabled ? (
                                <span className="jh-tag jh-tone-muted">已暂停</span>
                              ) : null}
                              {included ? (
                                <button
                                  type="button"
                                  className="jh-btn jh-btn-inline jh-btn-tiny"
                                  disabled={lastEnabled}
                                  title={
                                    lastEnabled
                                      ? '至少留一个启用的平台 —— 全暂停等于这个方案永远抓不到东西。'
                                      : entry.enabled
                                        ? '暂时不抓这个平台（保留它的页数配置与查重口径）。'
                                        : '恢复抓取这个平台。'
                                  }
                                  onClick={() => setOverride(item.id, { enabled: !entry.enabled })}
                                >
                                  {entry.enabled ? '暂停' : '恢复'}
                                </button>
                              ) : null}
                            </td>
                            <td>
                              <input
                                className="jh-input jh-pages-input"
                                type="number"
                                min={1}
                                max={item.maxPages}
                                value={entry.maxPages}
                                placeholder={planPages === '' ? '默认' : planPages}
                                disabled={!included || !entry.enabled}
                                aria-invalid={overCap}
                                aria-label={`${item.displayName} 的页数上限`}
                                onChange={(event) =>
                                  setOverride(item.id, { maxPages: event.target.value })
                                }
                              />
                            </td>
                            <td className="jh-muted">
                              {limitTextOf(item)}
                              {overCap ? (
                                <span className="jh-error"> · 超过上限，保存会被拒</span>
                              ) : null}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {stepOneBlocked ? (
              <p className="jh-warn" role="alert">
                {nameMissing ? '先填方案名。' : ''}
                {includedCount === 0 ? '至少纳入一个平台。' : ''}
                {includedCount > 0 && enabledCount === 0 ? '至少留一个未暂停的平台。' : ''}
                这两条同时也是保存接口的硬性判据。
              </p>
            ) : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
            {/* 多关键词（每行一个）：方案级专属输入区，取代维度网格里的单值 keyword。
                用原始文本承载（见 PlanForm.keywordsText 的注释），清洗只在 writeOf。 */}
            <div className="jh-field">
              <span className="jh-field-label">
                关键词（每行一个，最多 {String(PLAN_KEYWORDS_MAX)} 个）
                <FieldHint
                  text={`逐个采集：第 1 个关键词抓完它的页数再抓第 2 个，每个关键词一条独立的运行记录（能看到「Java 12 条、Go 3 条」）。留空 = 不按关键词筛（按平台默认列表抓）。注意：自动调度按站点访问次数计每日额度，N 个关键词 = N 次；手动「立即采集」不占额度。`}
                />
              </span>
              <textarea
                className="jh-textarea"
                rows={4}
                spellCheck={false}
                aria-label="搜索关键词，每行一个"
                placeholder={'Java\n前端\n测试'}
                value={form.keywordsText}
                onChange={(event) => patch({ keywordsText: event.target.value })}
              />
              {keywordCount === 0 ? null : keywordCount > PLAN_KEYWORDS_MAX ? (
                <span className="jh-error" role="alert">
                  {String(keywordCount)} 个关键词超过上限 {String(PLAN_KEYWORDS_MAX)} —— 保存会被拒。
                  需要更多就拆成两个方案（各自的额度与时段独立）。
                </span>
              ) : (
                <span className="jh-filter-note">
                  {String(keywordCount)} 个关键词 · 一轮按顺序抓 {String(keywordCount)} 遍
                </span>
              )}
            </div>

            {/* 高频区：只留"改方案时最常动的几个"。其余进高级筛选 ——
                它们默认值几乎都是"不限"，摊在明面上只会把上面这几个淹掉。 */}
            <div className="jh-section-title">筛选条件</div>
            {primaryItems.length === 0 ? (
              <p className="jh-muted">
                已纳入的平台没有声明任何筛选维度 —— 保存后它们会按平台自己的默认列表抓。
              </p>
            ) : (
              <div className="jh-grid2">{primaryItems.map(renderDimension)}</div>
            )}

            {/* 高级筛选默认收起；**有生效值时会被上面的 effect 自动展开**，
                折叠开关上也把项数写出来 —— 折叠的条件不能变成隐形条件。 */}
            {advancedItems.length === 0 ? null : (
              <>
                <button
                  type="button"
                  className="jh-plan-toggle"
                  aria-expanded={advancedOpen}
                  aria-controls="jh-plan-advanced"
                  onClick={() => setAdvancedOpen((open) => !open)}
                >
                  <span className="jh-plan-caret" aria-hidden="true">
                    {advancedOpen ? '▾' : '▸'}
                  </span>
                  <span className="jh-plan-toggle-text">高级筛选</span>
                  <span
                    className={`jh-filter-note${advancedActiveCount > 0 ? ' jh-filter-note-on' : ''}`}
                  >
                    {advancedActiveCount > 0
                      ? `已设 ${String(advancedActiveCount)} 项`
                      : advancedNames}
                  </span>
                </button>
                <div className="jh-plan-panel" id="jh-plan-advanced" hidden={!advancedOpen}>
                  <div className="jh-grid2">{advancedItems.map(renderDimension)}</div>
                </div>
              </>
            )}
          </>
        ) : null}

        {step === 2 ? (
          <>
            {/* 时段与运行日**同一行**（评审："保持与时间段选择器同一行对齐"）。
                两者回答的是同一件事 —— "什么时候跑"，拆成两行只是白占一屏。
                窄屏/放大字号下由 flex-wrap 逐项换行，不把控件压扁。 */}
            <fieldset className="jh-fieldset">
              <legend>
                定时
                <FieldHint text="触发时刻会在这段时间内随机选点，具体到哪一分钟不固定 —— 每天固定同一分钟去访问最容易被平台识别成自动化。这里刻意没有「精确到某分某秒」的选项。一天都不选运行日等于每天都跑；时段跨零点也可以（例如 22:00 至 02:00）。" />
              </legend>
              <div className="jh-schedule-row">
                <div className="jh-field">
                  <span className="jh-field-label">偏好时段</span>
                  <div className="jh-timerange">
                    {/* 字段级错误关联：quality-gates §6 要求"错误文本与字段关联"。
                        只有可见的红字而不做 aria-invalid / aria-describedby，读屏用户根本不知道
                        是哪个字段错了、错在哪。 */}
                    <input
                      className="jh-input jh-time"
                      type="time"
                      aria-label="时段起点"
                      aria-invalid={startMissing}
                      {...(startMissing ? { 'aria-describedby': 'jh-window-error' } : {})}
                      value={startMissing ? '' : form.windowStart}
                      onChange={(event) => {
                        const text = event.target.value
                        // 空串是"用户清空了"（保留空值以便提示），非空则必须是合法时间；
                        // 非法值直接**忽略**，不要让一次误触把配置改成别的时刻
                        if (text === '' || parseClockValue(text) !== null) patch({ windowStart: text })
                      }}
                    />
                    <span className="jh-timerange-sep">至</span>
                    <input
                      className="jh-input jh-time"
                      type="time"
                      aria-label="时段终点"
                      aria-invalid={endMissing}
                      {...(endMissing ? { 'aria-describedby': 'jh-window-error' } : {})}
                      value={endMissing ? '' : form.windowEnd}
                      onChange={(event) => {
                        const text = event.target.value
                        if (text === '' || parseClockValue(text) !== null) patch({ windowEnd: text })
                      }}
                    />
                  </div>
                </div>

                <div className="jh-field">
                  <span className="jh-field-label">运行日</span>
                  <div className="jh-segmented" role="group" aria-label="运行日">
                    {['日', '一', '二', '三', '四', '五', '六'].map((label, day) => (
                      <button
                        key={label}
                        type="button"
                        className={`jh-seg${form.weekdays.includes(day) ? ' jh-seg-on' : ''}`}
                        aria-pressed={form.weekdays.includes(day)}
                        title={`周${label}`}
                        onClick={() => {
                          const next = form.weekdays.includes(day)
                            ? form.weekdays.filter((item) => item !== day)
                            : [...form.weekdays, day].sort((a, b) => a - b)
                          patch({ weekdays: next })
                        }}
                      >
                        周{label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {startMissing || endMissing ? (
                <span className="jh-warn" id="jh-window-error" role="alert">
                  时段没填完整，保存时会退回默认的 09:00–11:00。
                </span>
              ) : null}

              {/* 一键预设：评审说的"收纳成快捷按键"。运行日与时段同一行，预设留在这里。 */}
              <div className="jh-chips jh-presets">
                {WEEKDAY_PRESETS.map((preset) => {
                  const active = form.weekdays.join(',') === preset.days.join(',')
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      className={`jh-btn jh-btn-tiny${active ? ' jh-btn-active' : ''}`}
                      aria-pressed={active}
                      title={preset.days.length === 0 ? '清空（等于每天）' : `设为${preset.label}`}
                      onClick={() => patch({ weekdays: [...preset.days] })}
                    >
                      {preset.label}
                    </button>
                  )
                })}
                <span className="jh-muted">
                  当前：{form.weekdays.length === 0 ? '每天' : formatWeekdays(form.weekdays)}
                </span>
              </div>

              <label className="jh-check">
                <input
                  type="checkbox"
                  checked={form.scheduleEnabled}
                  onChange={(event) => patch({ scheduleEnabled: event.target.checked })}
                />
                启用定时
              </label>

              {/* 执行频次说白：本方案没有"每隔 N 小时"这种表达式，频次就是
                  "哪几天 + 哪段时间"，所以直接把它写成一句话。 */}
              {startClock === null || endClock === null ? null : (
                <div className="jh-info">
                  <span className="jh-info-icon" aria-hidden="true">
                    ⓘ
                  </span>
                  <span>
                    执行频次：
                    {form.weekdays.length === 0 ? '每天' : formatWeekdays(form.weekdays)}{' '}
                    {formatWindow(startClock.hour, startClock.minute, endClock.hour, endClock.minute)}
                    {form.scheduleEnabled
                      ? '（时段内随机取点）'
                      : '（定时未启用 —— 只在你点「立即采集」时跑）'}
                  </span>
                </div>
              )}
            </fieldset>

            <fieldset className="jh-fieldset">
              <legend>
                抓取后处理
                <FieldHint text="三项默认全开。关掉打分后不再写匹配分；关掉标注后不再产出风险/黑话标记；跨平台去重要有多个平台才生效。" />
              </legend>
              <div className="jh-chips">
                <label
                  className="jh-check"
                  title="算出「这个岗位跟你简历有多匹配」并给出逐条理由。关掉后岗位库里不再显示匹配分。"
                >
                  <input
                    type="checkbox"
                    checked={form.score}
                    onChange={(event) => patch({ score: event.target.checked })}
                  />
                  打分
                </label>
                <label
                  className="jh-check"
                  title="识别「疑似外包 / 高风险 / 僵尸岗位 / 薪资虚标 / 行业黑话」并标出来。"
                >
                  <input
                    type="checkbox"
                    checked={form.flag}
                    onChange={(event) => patch({ flag: event.target.checked })}
                  />
                  风险与黑话标注
                </label>
                <label
                  className="jh-check"
                  title="同一个岗位出现在多个招聘平台时合并成一条。只纳入一个平台时它不会生效。"
                >
                  <input
                    type="checkbox"
                    checked={form.dedup}
                    onChange={(event) => patch({ dedup: event.target.checked })}
                  />
                  跨平台去重
                </label>
              </div>
            </fieldset>
          </>
        ) : null}
      </div>
    </Modal>
  )
}
