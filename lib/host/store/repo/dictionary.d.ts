import type { DatabaseSync } from 'node:sqlite';
/**
 * 黑话 / 信号词表（§4.10.3）。
 *
 * **纯规则，不走 LLM**：命中即产出解释与权重。词表存在 DB 里，
 * 用户可以在界面上加自己的词 —— 这比让模型去"理解" JD 里的话术可靠得多，
 * 也便宜得多（P6 可解释优于聪明）。
 */
export type DictionaryKind = 'jargon' | 'outsourcing' | 'fraud' | 'zombie' | 'salary';
export declare const DICTIONARY_KINDS: readonly DictionaryKind[];
export interface DictionaryEntry {
    id: number;
    kind: DictionaryKind;
    scope: string;
    term: string;
    meaning: string | null;
    weight: number;
    enabled: boolean;
}
export interface DictionarySeedEntry {
    kind: DictionaryKind;
    scope?: string;
    term: string;
    meaning?: string;
    weight?: number;
}
export interface DictionaryRepo {
    /** 幂等播种内置词表；返回新增条数（已存在的词不动，用户改过的权重不会被覆盖）。 */
    ensureSeed(entries: readonly DictionarySeedEntry[]): number;
    list(kind?: DictionaryKind): DictionaryEntry[];
    upsert(input: DictionarySeedEntry & {
        enabled?: boolean;
    }): void;
    setEnabled(id: number, enabled: boolean): void;
    count(): number;
}
export declare function createDictionaryRepo(db: DatabaseSync): DictionaryRepo;
//# sourceMappingURL=dictionary.d.ts.map