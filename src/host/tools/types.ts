/**
 * 工具注册的对外契约。
 *
 * 为什么单独放一个文件：`runtime.ts` 需要 `ToolRegistrationReport`（把注册结果经 `/health` 暴露出去），
 * 而工具实现需要 `HostRuntime` 类型。两者各自定义就会形成双向类型引用 ——
 * 把这个类型放进一个**不 import 任何本项目模块**的叶子里，依赖方向就永远是单向的：
 *
 *   runtime.ts  → tools/types.ts
 *   tools/*.ts  → runtime.ts
 */
import type { Disposer } from '../../shared/contract/dsh.js'

/** 一次注册的结果。**失败必须能被看到**，不能只写进日志就完事。 */
export interface ToolRegistrationReport {
  registered: string[]
  failed: Array<{ name: string; reason: string }>
  /** 注册前就已经被别的插件占用的名字（我们没去抢）。 */
  conflicts: string[]
}

export interface ToolRegistration {
  report: ToolRegistrationReport
  dispose: Disposer
}
