import type { DatabaseSync } from 'node:sqlite';
import type { TodoKind, TodoLevel } from '../../../shared/enums.js';
/** 一条待办。 */
export interface TodoRecord {
    id: number;
    kind: TodoKind;
    level: TodoLevel;
    title: string;
    ref: string | null;
    detail: unknown;
    dueAt: string | null;
    state: string;
    createdAt: string;
}
export interface CreateTodoInput {
    kind: TodoKind;
    level?: TodoLevel;
    title: string;
    ref?: string | null;
    detail?: unknown;
    dueAt?: string | null;
}
export interface TodoRepo {
    create(input: CreateTodoInput, now: string): number;
    /**
     * 幂等创建：同 `kind + ref` 已有未关闭待办时不再新建。
     * 降级告警每轮都会触发，必须靠这个去重，否则待办会被刷屏。
     * @returns 新建的 id；已存在时返回 null
     */
    createOnce(input: CreateTodoInput, now: string): number | null;
    listOpen(limit?: number): TodoRecord[];
    countOpen(): number;
    /** 用户点「知道了／忽略」。 */
    close(id: number, now: string): boolean;
    closeByRef(kind: TodoKind, ref: string, now: string): number;
}
export declare function createTodoRepo(db: DatabaseSync): TodoRepo;
//# sourceMappingURL=todos.d.ts.map