// 分区三「诊断与明细」：实验配置（平台静态事实 / 能力矩阵）+ 异常日志。
// 纯展示组件：数据与动作全部由 CollectScreen 通过 props 传入，本文件不持有任何状态。
import type { PlatformOverviewDto, RecentRunDto, SchedulerStatusDto } from '../../../shared/dto.js'
import type { FailureText } from '../../../shared/error-text.js'
import { LoadingLine } from '../../ui/async-view.js'
import { FieldHint } from '../../ui/field-hint.js'
import { CapabilityMatrix } from './capability-matrix.js'
import { RunLogCard } from './run-history.js'

/**
 * 「诊断与明细」分区：平台的静态事实与失败日志（排障时看，平时不看）。
 *
 * 所有 `useState` / `useAsync` 都留在 `CollectScreen`（见同目录 `index.tsx`）——
 * 「错误全文」弹窗与「运行仪表盘 · 最近运行」共用，所以留在父级。
 */
export function DiagnosticsTab(props: {
  status: SchedulerStatusDto | null
  runsLoading: boolean
  platformsLoading: boolean
  platformList: PlatformOverviewDto[]
  /** 平台配置取数失败时的原始信息（成功 / 加载中时为 null）。 */
  platformsError: string | null
  reasonFor: (skipReason: string | null) => string | null
  platformNameOf: (platformId: string) => string | null
  onOpenError: (run: RecentRunDto, failure: FailureText) => void
}) {
  return (
    <>
      {/* ── 实验配置：平台的**静态事实**（成熟度 / 能力 / 实现度）────────
          与「平台状态总览」的分工是刻意的：
            · 那边回答"它**现在**能不能跑"（随冷却、额度、登录态而变），
            · 这边回答"它**是什么**、我们实现了多少"（改了代码才会变）。
          两类混在一张表里，用户就分不清"这个平台一直需要登录"与
          "它现在正好在冷却"。原来这些事实是以**一段段散文**铺在
          「平台明细」里的：横向比不了，展开还要滚动，而且与总览表格重复。
          现在改成矩阵 —— 这些正好是横向可比的东西。 */}
      <section className="jh-card">
        <div className="jh-form-head">
          <h2 className="jh-card-title">实验配置与能力</h2>
          <FieldHint text="成熟度 = 这个适配器验证到什么程度（注册表里有平台 ≠ 这个平台能用）。「已实现」= 这条链路我们已经写了；「未实现」= 平台支持、我们还没写；「不支持」= 平台本身没有这个能力。抓取需登录与登录检测是两件事：前者是平台事实，后者是本机有没有做登录态检测。" />
        </div>
        {props.platformsError !== null && <p className="jh-error">{props.platformsError}</p>}
        {props.platformsLoading ? (
          <LoadingLine busy live="polite">
            正在读取平台配置…
          </LoadingLine>
        ) : props.platformList.length === 0 ? (
          <p className="jh-muted">还没有注册平台。</p>
        ) : (
          <CapabilityMatrix items={props.platformList} />
        )}
      </section>

      {/* ── 异常日志：只看"没跑成"的那些轮次 ──────────────────────────── */}
      <section className="jh-card">
        <div className="jh-form-head">
          <h2 className="jh-card-title">异常日志</h2>
          <FieldHint text="只列失败与被跳过的轮次 —— 成功的那几轮在「运行仪表盘 · 最近运行」里。点错误胶囊看原始信息与排查步骤。" />
        </div>
        <RunLogCard
          runs={props.status === null ? [] : props.status.recentRuns}
          loading={props.runsLoading}
          reasonFor={props.reasonFor}
          platformName={props.platformNameOf}
          onOpenError={props.onOpenError}
        />
      </section>
    </>
  )
}
