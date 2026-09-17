/**
 * 文本匹配（§4.10.3）—— **纯规则，不走 LLM**。
 *
 * 为什么不用模型：① 用户需要的是**可解释**（"为什么标了它"），词表命中天然可解释；
 * ② 每条 JD 都调模型做关键词匹配是纯浪费；③ 词表是用户可编辑的，
 * 遇到新话术加一条即可，不用等发版。
 */
import type { DictionaryEntry, DictionaryKind } from '../store/repo/dictionary.js';
/** 一次命中。`excerpt` 是命中处附近的原文，方便用户核对。 */
export interface TermHit {
    kind: DictionaryKind;
    term: string;
    meaning: string | null;
    weight: number;
    excerpt: string;
}
/** 全角 → 半角 + 折叠空白 + 小写，用于匹配（原文另存 `excerpt`）。 */
export declare function normalizeForMatch(input: string): string;
/**
 * 按词表匹配一段文本。
 *
 * 规则很朴素：归一化后做子串匹配。中文没有词边界，子串匹配是最稳的；
 * 英文/缩写同样适用（`KPI` 会被归一成小写再比）。
 *
 * @param text 待匹配文本（JD 正文、岗位名、公司名都可以）
 * @param entries 词表（只匹配 `enabled` 的条目）
 * @param maxHits 单次匹配的命中上限，防止异常 JD 刷出成百条
 */
export declare function matchTerms(text: string, entries: readonly DictionaryEntry[], maxHits?: number): TermHit[];
/** 把命中渲染成给用户看的一行依据，例如 `「弹性工作」→ 往往指没有固定下班时间`。 */
export declare function describeHit(hit: TermHit): string;
/** 按 kind 分组。 */
export declare function groupHits(hits: readonly TermHit[]): Map<DictionaryKind, TermHit[]>;
//# sourceMappingURL=text.d.ts.map