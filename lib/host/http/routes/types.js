/**
 * 路由层的**输入输出契约**（叶子模块，不 import 任何本项目模块）。
 *
 * 单独一个文件是为了让 `router.ts` 与 `routes/*` 之间不出现循环引用：
 * 类型在叶子里，路由模块与聚合入口都只依赖它。
 */
export {};
//# sourceMappingURL=types.js.map