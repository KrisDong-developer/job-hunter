import type { FormEvent } from 'react'
import { JOB_FLAG_LABEL, JOB_FLAG_TYPES, JOB_STATES, type JobFlagType } from '../../../shared/enums.js'
import type { ExpChip } from '../../../shared/facets.js'
import { JOB_STATE_LABEL } from '../../../shared/labels.js'
import { FieldHint } from '../../ui/field-hint.js'
import { NEW_JOB_WINDOWS, type Filters } from './filters.js'

/**
 * 筛选区：**一条朴素的常规工具条 + 一个「高级筛选」折叠**（2026-09-18 重做）。
 * 上一版拆成两个带标题、竖条、分隔线的"块"，还上了对齐网格 —— 在一屏本来就不宽的
 * 界面里堆了整套表单装饰，按钮被 margin-left:auto 推到屏幕另一头，离它要提交的控件老远。
 * 这一版做减法：常规条件就是一条工具条，按钮紧跟在最后一个控件后面；
 * 高级条件收进折叠面板，面板里只用"标签 + 控件"两列排布，没有边框、没有底色、没有标题。
 * 另外：一屏里同时出现胶囊 / 分段控件 / 拨杆三种形状本身就是噪音，
 * 所以新增时间回到原生单选下拉（原生 select 天然不可多选），
 * 跨平台折叠用项目里既有的复选框（.jh-check），形状只在**颜色**上做区分。
 *
 * 筛选草稿（`Filters`）与"展开 / 收起"都留在 `JobsScreen` ——
 * 这里只负责画，条件本身怎么算不归它管。
 */
export function FilterBar(props: {
  draft: Filters
  citiesAll: string[]
  eduAll: string[]
  expChips: ExpChip[]
  advancedOpen: boolean
  advancedCount: number
  onSubmit: (event: FormEvent) => void
  onReset: () => void
  onToggleAdvanced: () => void
  onKeyword: (value: string) => void
  onCity: (value: string) => void
  onState: (value: string) => void
  onMinSalary: (value: string) => void
  onExpBucket: (id: string) => void
  onEdu: (value: string) => void
  onNewWindow: (value: string) => void
  onExcludeFlag: (type: JobFlagType) => void
  onGroupDuplicates: (checked: boolean) => void
}) {
  const draft = props.draft
  const advancedOpen = props.advancedOpen
  const advancedCount = props.advancedCount
  const citiesAll = props.citiesAll
  const eduAll = props.eduAll
  const expChips = props.expChips
  return (
    <form className="jh-jobs-filters" onSubmit={props.onSubmit}>
      <div className="jh-jobs-filter-line">
        <input
          className="jh-input jh-input-grow"
          placeholder="关键词（岗位名）"
          aria-label="关键词"
          value={draft.q}
          onChange={(event) => props.onKeyword(event.target.value)}
        />
        <select
          className="jh-select jh-input-md"
          aria-label="城市"
          value={draft.cities[0] ?? ''}
          onChange={(event) => props.onCity(event.target.value)}
        >
          <option value="">全部城市</option>
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
        <input
          className="jh-input jh-input-sm"
          placeholder="最低月薪"
          aria-label="最低月薪"
          inputMode="numeric"
          value={draft.minSalary}
          onChange={(event) => props.onMinSalary(event.target.value)}
        />
        {/* 主次分明：筛选是主操作（实心），重置是三级动作（无边框）。
            贴在最后一个控件后面 —— 筛选条是一句话，按钮是这句话的句号，
            不该飘到屏幕另一头（那是上一版最刺眼的毛病）。 */}
        <button type="submit" className="jh-btn jh-btn-inline jh-btn-primary">筛选</button>
        <button type="button" className="jh-btn jh-btn-inline jh-btn-quiet" onClick={props.onReset}>重置</button>
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
          {advancedCount > 0 ? `已选 ${String(advancedCount)} 项` : '经验 / 学历 / 新增时间 / 屏蔽 / 跨平台折叠'}
        </span>
      </button>
      {/* 收起用 hidden 而不是不渲染：DOM 留着，aria-controls 才有指向，展开时也不重建控件。
          ⚠️ 必须配 `.jh-jobs-filter-panel[hidden]{display:none}` —— 类选择器的 display 会盖掉
          UA 样式表里的 [hidden]，不写这条就收不起来。
          类名一律带 `jh-jobs-` 前缀：同一个仓库里有别的会话在并行改界面，
          `jh-filter-panel` 这种通用名已经撞过一次（流水线屏在用），所以按屏前缀区分。 */}
      <div className="jh-jobs-filter-panel" id="jh-jobs-advanced" hidden={!advancedOpen}>
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
            {/* 原生单选下拉：它天然不可多选，"能同时选近24小时和近7天吗"这个疑问不存在。
                也比分段控件少一种形状 —— 与上面的城市 / 状态下拉是同一套控件。 */}
            <select
              className="jh-select jh-input-md"
              aria-label="只看新增"
              value={draft.newWindow}
              onChange={(event) => props.onNewWindow(event.target.value)}
            >
              <option value="">不限</option>
              {NEW_JOB_WINDOWS.map((option) => (
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
            <FieldHint text="命中标注的岗位一律不显示。标注是本地规则算出来的（外包/高风险/僵尸岗/黑话等），不需要你逐条判断；每一项都可以单独关掉。" />
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
            <FieldHint text="同一条岗位在多个平台各抓一条时只显示一行（展开可看各平台对照）。条数与分页也跟着按折叠后算。默认关闭：折叠会少显示行，「默认少显示」是替你做决定。" />
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
          </span>
        </div>
      </div>
    </form>
  )
}
