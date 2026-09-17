export interface ToolExecInfo {
    toolName: string;
    /** 不透明活对象，仅转发给 `ctx.approval`。 */
    agent: unknown;
    callId?: string | undefined;
    signal?: AbortSignal | undefined;
}
export declare const toolExec: {
    run<T>(info: ToolExecInfo, fn: () => Promise<T>): Promise<T>;
    current(): ToolExecInfo | undefined;
    /** 供测试/诊断：当前是否处于工具调用内。 */
    active(): boolean;
};
//# sourceMappingURL=exec-context.d.ts.map