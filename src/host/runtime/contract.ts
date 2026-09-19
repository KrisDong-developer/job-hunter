/**
 * 装配门面的**契约层**（叶子模块）。
 *
 * 这里只有两样东西：`RuntimeFailure` 的形状，以及「数据层尚未就绪」这个统一错误。
 *
 * ## 为什么单独成一个模块（而不是留在 runtime.ts 里）
 *
 * 是**依赖方向**问题，不是文件大小问题：`http/routes/*` 有 10 处 `throw dataNotReady(...)`，
 * 而它们此前只能 `import ... from '../../runtime.js'` —— 于是「路由」在**运行时**
 * 依赖整个装配点（全部适配器 + 浏览器 + 调度器 + sqlite 迁移）。
 * 这个模块把那条边换成一条通向叶子的边。
 *
 * ## 为什么 `HostRuntime` 本体不在这里
 *
 * 那个接口是**门面自己声明的形状**，该跟它的实现放在一起（见 runtime.ts 文件头）。
 * 这里只要回答一个问题：「一个还没就绪的 runtime，至少要能提供什么」—— 也就是 `failure()`。
 * 参数类型写成结构化的那一格而不是 `HostRuntime`，正是这个意思：
 * 装配点实现整个接口，而这里只依赖其中一格，因此**不产生** runtime.ts ↔ contract.ts 的双向引用。
 */
import { DomainError } from '../util/errors.js'

/** 数据层就绪失败的原因（`HostRuntime.failure()` 的返回形状）。 */
export interface RuntimeFailure {
  code: string
  message: string
  hint?: string
}

/** 数据层未就绪时的统一错误。 */
export function dataNotReady(runtime: { failure(): RuntimeFailure | null }): DomainError {
  const failure = runtime.failure()
  return new DomainError('DATA_UNAVAILABLE', failure?.message ?? '数据层尚未就绪', {
    ...(failure?.hint === undefined ? {} : { hint: failure.hint }),
  })
}
