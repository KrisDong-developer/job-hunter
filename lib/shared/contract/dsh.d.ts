/**
 * 我们实际消费的 DSH / Cordis 接口的**最小本地类型面**。
 *
 * 为什么不直接依赖官方包的类型：P0 阶段只用到 `slots` / `layout` / `webServer` 三个面，
 * 引入整棵 `dsh-client-*` / `dsh-host-*` 依赖树会显著抬高安装失败面（与 C5 同类的问题）。
 * 下面每个形状都来自运行态 Inspect 的实测契约（见 `P0-VERIFICATION.md`），不是猜的。
 * 后续需要更完整的类型时，替换成官方 peerDependency 即可，不影响运行时代码。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
/** Cordis 插件上下文里我们用到的部分。 */
export interface PluginContext {
    /** 读取服务；可选依赖一律走这里并处理 undefined。 */
    get(serviceName: string): unknown;
    /** 注册随 fiber 自动回收的副作用。回调**立即**执行，其返回值即清理函数。 */
    effect(callback: () => (() => void) | void, label?: string): () => void;
    /**
     * 等依赖就绪后再执行（cordis 的 `ctx.inject`）。
     *
     * 与 `export const inject = [...]` 的区别是**不会把插件挂起**：
     * 后者在依赖永远不出现时会让插件永久 `pending`，进而让整个 profile 启动失败。
     * 对于我们这种"主能力不依赖 webServer，只有 GUI 路由依赖它"的插件，这才是对的形状。
     * 老宿主没有它时调用方要能退化（试一次）。
     */
    inject?(deps: string[], callback: (scoped: PluginContext) => void): unknown;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
        error(message: unknown): void;
    };
}
/** 一次性的清理函数。 */
export type Disposer = () => void;
/**
 * 一个槽位条目。
 * keyed 槽位（如 `main`）用 `key`；list 槽位（如 `sidebar.panellist`）用 `id`。
 */
export interface SlotEntryOptions {
    name: string;
    key?: string;
    id?: string;
    order?: number;
    label?: string | (() => string);
    locale?: string;
}
export interface SlotsService {
    register<P>(options: SlotEntryOptions, component: (props: P) => unknown): Disposer;
    inject(slotName: string, callback: () => Disposer | Iterable<Disposer>): Disposer;
}
/** `ctx.layout`：面板导航。 */
export interface LayoutService {
    /** `null` 表示回到对话区；选中未注册的 key **会抛错**且保留当前选择（R1 实测）。 */
    selectPanel(panelId: string | null): void;
}
export interface WebRoute {
    kind: 'exact' | 'prefix';
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
}
/** `ctx.webServer`：浏览器 HTTP 载体。同名 (kind, path) 重复注册会抛错。 */
export interface WebServerService {
    register(route: WebRoute): Disposer;
}
/** Cordis 插件对象形状：宿主半与客户端半共用。 */
export interface CordisPlugin {
    name?: string;
    inject?: string[];
    apply(ctx: PluginContext): void;
}
/** 一个文本内容块。工具结果与模型上下文都用它。 */
export interface TextBlock {
    type: 'text';
    text: string;
}
/** 我们只产出文本块；其余块类型原样透传、不构造。 */
export type ContentBlock = TextBlock | {
    type: string;
    [key: string]: unknown;
};
/** JSON Schema 节点（只用到这几个关键字）。 */
export interface JsonSchemaNode {
    type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
    properties?: Record<string, JsonSchemaNode>;
    required?: string[];
    additionalProperties?: boolean;
    items?: JsonSchemaNode;
    enum?: Array<string | number | boolean | null>;
    const?: string | number | boolean | null;
    description?: string;
    title?: string;
    default?: unknown;
}
export interface ToolOutputDefinition {
    /** 返回值（`value`）的结构，供宿主校验与展示。 */
    schema: JsonSchemaNode;
    /** 把 `value` 渲染成模型看到的内容块 —— 这一份就是模型的上下文，必须**克制**（§22.5）。 */
    render(args: unknown, value: unknown): ContentBlock[];
    presentationMeta?(args: unknown, value: unknown): unknown;
}
/** 工具执行上下文里我们用到的部分（`ToolRunContext`）。 */
export interface ToolRunContext {
    readonly callId?: string;
    /** 不透明的活对象：只原样转发给 approval，绝不检视（DSH 活数据规则）。 */
    readonly agent?: unknown;
    readonly signal?: AbortSignal;
    concludeTurn?(): void;
}
export interface ToolDefinition {
    name: string;
    description: string;
    /** 参数的 JSON Schema。 */
    parameters: Record<string, unknown>;
    output: ToolOutputDefinition;
    execute(args: unknown, exec: ToolRunContext): Promise<unknown>;
    timeoutMs?: number;
    isConcurrencySafe?(args: unknown): boolean;
}
export interface ToolsService {
    register(definition: ToolDefinition): Disposer;
    /**
     * 当前可见的工具 schema。用来在注册前发现**重名**。
     *
     * 可选：老版本宿主可能没有这个方法，所以调用点要能容忍 undefined。
     */
    schemas?(): Array<{
        name: string;
    }>;
}
/**
 * 一次工具调用在对话里的冻结节点。
 *
 * 两种形态（实测）：
 *   * 运行中：没有 `kind`，`argsRaw` 在顶层；
 *   * 已结算：有 `kind`，`argsRaw` 在 `call` 里，正文在 `content`。
 */
export interface ToolCallBlockView {
    readonly callId?: string;
    readonly kind?: string;
    readonly argsRaw?: string;
    readonly call?: {
        readonly argsRaw?: string;
    };
    readonly content?: readonly ContentBlock[];
    readonly isError?: boolean;
    readonly error?: {
        readonly name?: string;
        readonly code?: string;
    };
}
/** 每个原子 toolview 都会收到的 owner props。 */
export interface ToolCallOwnerProps {
    readonly callId: string;
    readonly toolName: string;
    readonly block: ToolCallBlockView;
    readonly cwd?: string | undefined;
    readonly home?: string | undefined;
    /** 在轨迹视图里查看这次调用（有就渲染一个入口）。 */
    inspect?: (() => void) | undefined;
}
/** `ctx.approval`（§22.4）：审批结果只有 `allowed-once` 是放行。 */
export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable';
export interface ApprovalService {
    request(req: {
        readonly agent: unknown;
        readonly toolName: string;
        readonly callId?: string;
        readonly reason?: string;
        readonly signal?: AbortSignal;
    }): Promise<ApprovalOutcome>;
}
/** 读服务并在缺失时返回 undefined，避免到处写断言。 */
export declare function serviceOf<T>(ctx: PluginContext, name: string): T | undefined;
//# sourceMappingURL=dsh.d.ts.map