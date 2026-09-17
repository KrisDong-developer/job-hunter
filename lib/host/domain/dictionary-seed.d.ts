/**
 * 内置词表（§4.10.3）。
 *
 * **纯规则、不走 LLM**：命中即产出解释与权重。词表以 DB 为权威（ADR-19），
 * 这里只是首次播种的默认值 —— 用户可以在界面上加自己的词，播种不会覆盖已存在的词。
 *
 * `meaning` 是给用户看的**解释**，不是给模型看的提示词：它要能直接回答
 * 「为什么这条被标了」。
 */
import type { DictionarySeedEntry } from '../store/repo/dictionary.js';
export declare const DICTIONARY_SEED: readonly DictionarySeedEntry[];
//# sourceMappingURL=dictionary-seed.d.ts.map