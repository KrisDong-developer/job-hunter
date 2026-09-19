import type { DatabaseSync } from 'node:sqlite';
import type { SettingScope } from '../../../shared/contract/enums/plan.js';
/**
 * 配置仓储（ADR-19 / D-18：**DB 为权威**，支持导入导出，明确不支持远程加载）。
 *
 * 适配器的选择器就存在这里：`scope='platform'` / `scope_ref='<platform_id>'` / `key='selectors'`。
 * 代码里带的是一份默认值，DB 里的覆盖优先 —— 选择器坏了自己在 UI 改，不用等发版（J2）。
 */
export interface SettingRecord {
    key: string;
    scope: SettingScope;
    scopeRef: string;
    value: unknown;
    updatedAt: string;
}
export interface SettingRepo {
    get<T>(key: string, scope: SettingScope, scopeRef?: string): T | undefined;
    set(key: string, scope: SettingScope, scopeRef: string, value: unknown, now: string): void;
    remove(key: string, scope: SettingScope, scopeRef: string): void;
    listByScope(scope: SettingScope, scopeRef: string): SettingRecord[];
}
export declare function createSettingRepo(db: DatabaseSync): SettingRepo;
//# sourceMappingURL=settings.d.ts.map