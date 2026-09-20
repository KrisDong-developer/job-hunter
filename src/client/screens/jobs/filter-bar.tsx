import { useState, type FormEvent } from 'react'
import {
  JOB_FLAG_LABEL,
  JOB_FLAG_TYPES,
  JOB_STATES,
  JOB_STATE_LABEL,
  JOB_NEW_WINDOWS,
  type JobFlagType,
} from '../../../shared/contract/enums/job.js'
import type { ExpChip } from '../../../shared/domain/job-facets.js'
import type { SavedJobViewDto } from '../../../shared/contract/dto/job.js'
import { MAX_SAVED_JOB_VIEWS, MAX_SAVED_JOB_VIEW_NAME } from '../../../shared/config/limits.js'
import { FieldHint } from '../../ui/field-hint.js'
import type { Filters } from './filters.js'

/**
 * 城市下拉里的**合成值**：表示"当前是多选，具体哪些在面板里看"。
 * 用一对下划线包起来，不可能与真实城市名撞车；它只出现在下拉选项里，
 * 永远不会写进 `Filters.cities`（`onChange` 里直接忽略它）。
 */
const MULTI_CITY = '__multi_city__'

/**
 * 筛选区：**一条朴素的常规工具条 + 一个「高级筛选」折叠**（2026-09-18 重做）。
 * 上一版拆成两个带标题、竖条、分隔线的"块"，还上了对齐网格 —— 在一屏本来就不宽的
 * 界面里堆了整套表单装饰，按钮被 margin-left:auto 推到屏幕另一头，离它要提交的控件老远。
 * 这一版做减法：常规条件就是一条工具条，按钮紧跟在最后一个控件后面；
 * 高级条件收进折叠面板，面板里只用"标签 + 控件"两列排布，没有边框、没有底色、没有标题。
 * 一屏里同时出现胶囊 / 分段控件 / 拨杆三种形状本身就是噪音，所以新增时间回到原生
 * 单选下拉，跨平台折叠用既有的复选框（.jh-check）。
 *
 * ── 第四轮（审核 P1-4 / P2-12）
 *   * 关键词与最低月薪加上**可见标签**（原先只有 placeholder，2.6:1 且输入后消失）；
 *   * 草稿与已生效条件不一致时，工具条尾部说明"点筛选才生效"。
 *
 * ── 第五轮（批次 A / B）
 *   * `最低分`：按匹配分筛（0–100）—— 与"最低月薪"同一档控件、同一种语义（点筛选才生效）；
 *   * `城市`恢复**多选 chips**（放在折叠面板里，工具条保留下拉做单选快捷入口）：
 *     查询层一直支持多城市，"深圳+杭州"这种组合每天都要用，而下拉一次只能选一个；
 *     面板里的 chips 与工具条的下拉写的是同一份状态，下拉在多选时显示"已选 N 个城市"；
 *   * `排除已拉黑公司`：默认开着（见 `filters.ts` 的 EMPTY_FILTERS），
 *     隐藏了几条由列表头栏如实写明 —— 可以隐藏，但绝不静默隐藏；
 *   * 视图（B2）：保存/套用/删除常用条件组合（存在宿主 `setting` 表里，跨标签一致）。
 *
 * 筛选草稿（`Filters`）与"展开 / 收起"都留在 `JobsScreen` ——
 * 这里只负责画，条件本身怎么算不归它管（视图的读写也在那边，这里只发意图）。
 */
export function FilterBar(props: {
  draft: Filters
  citiesAll: string[]
  eduAll: string[]
  expChips: ExpChip[]
  advancedOpen: boolean
  advancedCount: number
  /** 草稿与已生效条件不一致 —— 工具条尾部要说明"还没生效"（第四轮，审核 P2-12）。 */
  pending: boolean
  /** 保存的筛选视图（第五轮，批次 B2）。 */
  views: SavedJobViewDto[]
  /** 当前套用的视图 id（`''` = 没套用任何视图）。 */
  appliedViewId: string
  onSubmit: (event: FormEvent) => void
  onReset: () => void
  onToggleAdvanced: () => void
  onKeyword: (value: string) => void
  /** 工具条下拉：单选（选空 = 不限）。 */
  onCity: (value: string) => void
  /** 面板里的 chips：多选（选中就加，再点就去掉）。 */
  onCityToggle: (city: string) => void
  onState: (value: string) => void
  onMinSalary: (value: string) => void
  onMinScore: (value: string) => void
  onExpBucket: (id: string) => void
  onEdu: (value: string) => void
  onNewWindow: (value: string) => void
  onExcludeFlag: (type: JobFlagType) => void
  onExcludeBlacklisted: (checked: boolean) => void
  onGroupDuplicates: (checked: boolean) => void
  onApplyView: (id: string) => void
  onSaveView: (name: string) => void
  onDeleteView: (id: string) => void
}) {
  const draft = props.draft
  const advancedOpen = props.advancedOpen
  const advancedCount = props.advancedCount
  const citiesAll = props.citiesAll
  const eduAll = props.eduAll
  const expChips = props.expChips
  /**
   * "保存为视图"的就地输入（不弹窗）。
   *
   * 为什么不用 `window.prompt`：宿主面板里那个原生弹窗的观感与阻断行为都不受我们控制，
   * 而且是同步阻塞的。就地输入只多两个按钮，形状全是既有控件。
   */
  const [naming, setNaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  /**
   * 选中的城市不在当前 facet 列表里时（例如套用了很久以前保存的视图，
   * 而那个城市现在库里一条岗位都没有）—— 下拉里要把它补进去。
   * 不补的话 `value` 落不到任何 option 上，浏览器会显示"全部城市"，
   * 而列表明明是筛过的：又一个"控件在说谎"的场景。
   */
  const strayCity =
    draft.cities.length === 1 && !citiesAll.includes(draft.cities[0] ?? '') ? (draft.cities[0] ?? '') : null

  const submitName = (): void => {
    const name = nameDraft.trim()
    if (name === '') return
    props.onSaveView(name)
    setNameDraft('')
    setNaming(false)
  }

  return (
    <form className="jh-jobs-filters" onSubmit={props.onSubmit}>
      <div className="jh-jobs-filter-line">
        {/* 关键词 / 最低月薪 / 最低分：**带可见标签**（第四轮修复，审核 P1-4）。
            它们原先只有 placeholder 当标签 —— 一是对比度只有 2.6:1（caption 档），
            二是开始输入后标签就没了，用户没法回看这个框是什么。现在标签在控件旁边，
            placeholder 一并去掉：有了标签就不需要它，留着只是多一处低对比度文字。
            状态下拉不在此列：它的当前值（「全部状态」）本身就是说明。 */}
        <label className="jh-jobs-filter-text">
          <span>关键词</span>
          <input
            className="jh-input"
            value={draft.q}
            onChange={(event) => props.onKeyword(event.target.value)}
          />
        </label>
        {/* 城市下拉：单选快捷入口。多选时它显示"已选 N 个城市"（真正的多选在面板里），
            这样同一份状态只有一个来源，用户也不会看到两个控件各说各的。 */}
        <select
          className="jh-select jh-input-md"
          aria-label="城市（单选；多选在高级筛选里）"
          value={draft.cities.length > 1 ? MULTI_CITY : (draft.cities[0] ?? '')}
          onChange={(event) => {
            if (event.target.value === MULTI_CITY) return
            props.onCity(event.target.value)
          }}
        >
          <option value="">全部城市</option>
          {strayCity === null ? null : <option value={strayCity}>{strayCity}（不在当前城市列表里）</option>}
          {draft.cities.length > 1 ? (
            <option value={MULTI_CITY}>已选 {draft.cities.length} 个城市</option>
          ) : null}
          {citiesAll.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
        <select
          className="jh-select jh-input-md"
          aria-label="状态"
          value={draft.state}
          onChange={(event) => props.onState(event.target.value)}
        >
          <option value="">全部状态</option>
          {JOB_STATES.map((value) => (
            <option key={value} value={value}>
              {JOB_STATE_LABEL[value]}
            </option>
          ))}
        </select>
        <label className="jh-jobs-filter-text jh-jobs-filter-text-narrow">
          <span>最低月薪</span>
          <input
            className="jh-input"
            inputMode="numeric"
            value={draft.minSalary}
            onChange={(event) => props.onMinSalary(event.target.value)}
          />
        </label>
        {/* 最低分（批次 A）：与"最低月薪"同档控件、同一种语义（点筛选才生效）。
            它比的是**库里存着的那个分**，换简历后旧分会被标成过期（列表上会写"按旧简历"）。 */}
        <label className="jh-jobs-filter-text jh-jobs-filter-text-narrow">
          <span>最低分</span>
          <input
            className="jh-input"
            inputMode="numeric"
            value={draft.minScore}
            onChange={(event) => props.onMinScore(event.target.value)}
          />
        </label>
        {/* 主次分明：筛选是主操作（实心），重置是三级动作（无边框）。
            贴在最后一个控件后面 —— 筛选条是一句话，按钮是这句话的句号，
            不该飘到屏幕另一头（那是上一版最刺眼的毛病）。 */}
        <button type="submit" className="jh-btn jh-btn-inline jh-btn-primary">筛选</button>
        <button type="button" className="jh-btn jh-btn-inline jh-btn-quiet" onClick={props.onReset}>重置</button>
        {/* 条件改了但还没提交（第四轮修复，审核 P2-12）：折叠开关上的「已选 N 项」
            算的是草稿，列表头栏那句算的是已生效的条件 —— 两者可以不一致。
            这行字把差别说出来，免得用户以为列表已经按新条件筛过了。 */}
        {props.pending ? (
          <span className="jh-jobs-filter-pending">条件已改动，点「筛选」生效</span>
        ) : null}
        {/* 视图（批次 B2）：套用/保存常用条件组合。放在工具条尾部 ——
            它管的正是"这一整行条件"，而不是某一个字段。 */}
        <label className="jh-jobs-filter-text jh-jobs-filter-text-narrow">
          <span>视图</span>
          <select
            className="jh-select"
            aria-label="套用保存的视图"
            value={props.appliedViewId}
            onChange={(event) => props.onApplyView(event.target.value)}
          >
            <option value="">不套用</option>
            {props.views.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </label>
        {naming ? (
          <>
            <input
              className="jh-input jh-jobs-view-name"
              value={nameDraft}
              maxLength={MAX_SAVED_JOB_VIEW_NAME}
              aria-label="视图名字"
              placeholder="给这组条件起个名字"
              autoFocus
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  // 回车即保存，但不提交外层表单（那会顺带触发一次筛选）
                  event.preventDefault()
                  submitName()
                }
                if (event.key === 'Escape') setNaming(false)
              }}
            />
            <button type="button" className="jh-btn jh-btn-inline jh-btn-primary" onClick={submitName}>
              保存
            </button>
            <button type="button" className="jh-btn jh-btn-inline jh-btn-quiet" onClick={() => setNaming(false)}>
              取消
            </button>
          </>
        ) : (
          <button
            type="button"
            className="jh-btn jh-btn-inline jh-btn-quiet"
            disabled={props.views.length >= MAX_SAVED_JOB_VIEWS}
            title={
              props.views.length >= MAX_SAVED_JOB_VIEWS
                ? `最多保存 ${String(MAX_SAVED_JOB_VIEWS)} 个视图，先删掉几个`
                : '把当前这套条件存下来，下次一键套用'
            }
            onClick={() => setNaming(true)}
          >
            保存为视图
          </button>
        )}
        {props.appliedViewId === '' ? null : (
          <button
            type="button"
            className="jh-btn jh-btn-inline jh-btn-quiet"
            title="删掉当前套用的这个视图（不影响列表里的条件）"
            onClick={() => props.onDeleteView(props.appliedViewId)}
          >
            删除视图
          </button>
        )}
      </div>

      {/* 折叠开关：一整行只有一行小字，不抢视线 */}
      <button
        type="button"
        className="jh-jobs-filter-toggle"
        aria-expanded={advancedOpen}
        aria-controls="jh-jobs-advanced"
        onClick={props.onToggleAdvanced}
      >
        <span className="jh-jobs-filter-caret" aria-hidden="true">{advancedOpen ? '▾' : '▸'}</span>
        <span className="jh-jobs-filter-toggle-text">高级筛选</span>
        <span className={`jh-filter-note${advancedCount > 0 ? ' jh-filter-note-on' : ''}`}>
          {advancedCount > 0 ? `已选 ${String(advancedCount)} 项` : '城市 / 经验 / 学历 / 新增时间 / 屏蔽 / 跨平台折叠'}
        </span>
      </button>
      {/* 收起用 hidden 而不是不渲染：DOM 留着，aria-controls 才有指向，展开时也不重建控件。
          ⚠️ 必须配 `.jh-jobs-filter-panel[hidden]{display:none}` —— 类选择器的 display 会盖掉
          UA 样式表里的 [hidden]，不写这条就收不起来。
          类名一律带 `jh-jobs-` 前缀：同一个仓库里有别的会话在并行改界面，
          `jh-filter-panel` 这种通用名已经撞过一次（流水线屏在用），所以按屏前缀区分。 */}
      <div className="jh-jobs-filter-panel" id="jh-jobs-advanced" hidden={!advancedOpen}>
        {citiesAll.length === 0 ? null : (
          <div className="jh-jobs-filter-row">
            <span className="jh-jobs-filter-label">
              城市
              <FieldHint text="可多选：命中任意一个城市的岗位都会显示（深圳+杭州 这样一起看）。上面的下拉是单选快捷入口，两处写的是同一份条件，多选时下拉会显示「已选 N 个城市」。" />
            </span>
            <span className="jh-jobs-filter-body" role="group" aria-label="城市（可多选）">
              {citiesAll.map((city) => (
                <button
                  key={city}
                  type="button"
                  className={`jh-chip${draft.cities.includes(city) ? ' jh-chip-on' : ''}`}
                  aria-pressed={draft.cities.includes(city)}
                  onClick={() => props.onCityToggle(city)}
                >
                  {city}
                </button>
              ))}
            </span>
          </div>
        )}

        {expChips.length === 0 ? null : (
          <div className="jh-jobs-filter-row">
            <span className="jh-jobs-filter-label">
              经验
              <FieldHint text="各平台的经验写法不统一（1-3年 / 1年～3年 / 2-3年 / 2年及以上…），这里归成 6 个标准梯队。选中一档，会把库里属于它的写法一起查出来，所以不会被梯队的名字漏掉。" />
            </span>
            <span className="jh-jobs-filter-body" role="group" aria-label="经验要求（可多选）">
              {expChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={`jh-chip${draft.expBuckets.includes(chip.id) ? ' jh-chip-on' : ''}`}
                  aria-pressed={draft.expBuckets.includes(chip.id)}
                  title={`库里属于这一档的写法：${chip.values.join(' / ')}`}
                  onClick={() => props.onExpBucket(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </span>
          </div>
        )}

        {eduAll.length === 0 ? null : (
          <div className="jh-jobs-filter-row">
            <span className="jh-jobs-filter-label">学历</span>
            <span className="jh-jobs-filter-body" role="group" aria-label="学历要求（可多选）">
              {eduAll.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`jh-chip${draft.eduReqs.includes(value) ? ' jh-chip-on' : ''}`}
                  aria-pressed={draft.eduReqs.includes(value)}
                  onClick={() => props.onEdu(value)}
                >
                  {value}
                </button>
              ))}
            </span>
          </div>
        )}

        <div className="jh-jobs-filter-row">
          <span className="jh-jobs-filter-label">
            新增时间
            <FieldHint text="按「首次见到」时间算，与首屏「今日新增」同口径 —— 再抓一次不会让老岗位混进来（那是「最近见到」）。单选，不选 = 不限。" />
          </span>
          <span className="jh-jobs-filter-body">
            {/* 原生单选下拉：它天然不可多选，"能同时选近24小时和近7天吗"这个疑问不存在。 */}
            <select
              className="jh-select jh-input-md"
              aria-label="只看新增"
              value={draft.newWindow}
              onChange={(event) => props.onNewWindow(event.target.value)}
            >
              <option value="">不限</option>
              {JOB_NEW_WINDOWS.map((option) => (
                <option key={option.value} value={option.value} title={option.label}>
                  {option.label}
                </option>
              ))}
            </select>
          </span>
        </div>

        <div className="jh-jobs-filter-row">
          <span className="jh-jobs-filter-label">
            屏蔽
            <FieldHint text="命中标注的岗位一律不显示。标注是本地规则算出来的（外包/高风险/僵尸岗/黑话等），不需要你逐条判断；每一项都可以单独关掉。最后一项是公司黑名单：拉黑过的公司默认不显示，隐藏了几条会在列表头栏写明。" />
          </span>
          {/* 负向过滤只靠**颜色**与正向 chips 区分（浅红底 + 红字 + ✕），形状保持同一种胶囊：
              多造一种形状换来的辨识度，抵不过一屏四种控件的杂乱。 */}
          <span className="jh-jobs-filter-body" role="group" aria-label="屏蔽标注">
            {JOB_FLAG_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={`jh-chip jh-chip-neg${draft.excludeFlags.includes(type) ? ' jh-chip-neg-on' : ''}`}
                aria-pressed={draft.excludeFlags.includes(type)}
                title={`不显示标注为「${JOB_FLAG_LABEL[type]}」的岗位`}
                onClick={() => props.onExcludeFlag(type)}
              >
                {JOB_FLAG_LABEL[type]}
              </button>
            ))}
          </span>
        </div>

        <div className="jh-jobs-filter-row">
          <span className="jh-jobs-filter-label">
            折叠
            <FieldHint text="同一条岗位在多个平台各抓一条时只显示一行（展开可看各平台对照），组内保留的那一条跟着当前排序走（按匹配分排就留分最高的那条）。条数与分页也跟着按折叠后算。默认关闭：折叠会少显示行，「默认少显示」是替你做决定。" />
          </span>
          {/* 复选框而不是拨杆：它和旁边的条件一样**点「筛选」才生效**。
              拨杆的形态承诺"现在就开着了"，放在要提交的表单里反而会误导
              （这也是上一版看起来别扭的原因之一）。 */}
          <span className="jh-jobs-filter-body">
            <label className="jh-check">
              <input
                type="checkbox"
                checked={draft.groupDuplicates}
                onChange={(event) => props.onGroupDuplicates(event.target.checked)}
              />
              跨平台折叠（同一条岗位只显示一行）
            </label>
            {/* 排除已拉黑公司（批次 B）：默认开着。
                放在"屏蔽"这一组里语义最贴（都是"我不想看到"），但它与上面的标注屏蔽
                有个关键区别 —— 它隐藏的条数**会**在列表头栏写明，因为"看不到东西"
                必须有个交代。 */}
            <label className="jh-check">
              <input
                type="checkbox"
                checked={draft.excludeBlacklisted}
                onChange={(event) => props.onExcludeBlacklisted(event.target.checked)}
              />
              排除已拉黑公司的岗位
            </label>
          </span>
        </div>
      </div>
    </form>
  )
}
