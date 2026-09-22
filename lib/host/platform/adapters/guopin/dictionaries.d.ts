/**
 * 国聘网的两份筛选取值域 —— **2026-09-21 探针实测**（`POST /api/base/category/v1/by-alias`）。
 *
 * 这不是"抄了一部分"：接口一次返回全量，这里就是全量。
 * 依据与判定方法见 `docs/FILTER-EVIDENCE.md`；探针：
 * `node scripts/run-ts.mjs test/tools/probe-filters.ts --platforms=guopin`。
 *
 * ⚠️ 只有 `experience`（11 项）与 `major`（34 项）**被证明确实会筛**：
 * `api-diff` 实测 `search.experience=["113aJGtA"]` → total 400→48，`search.major=["117CvKmE"]` → 400→364。
 * 同一份字典里的 `nature` / `education` / `companyNature` / `companyScale` / `financingStage` /
 * `research` / `zwfl` 按测过的形状**不生效**（total 不变）→ **不声明**，等探明真实键名/形状再说。
 */
/** `job_experience`（工作经验）。 */
export declare const GUOPIN_EXPERIENCE_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/** `job_major`（专业）。 */
export declare const GUOPIN_MAJOR_OPTIONS: Array<{
    value: string;
    label: string;
}>;
//# sourceMappingURL=dictionaries.d.ts.map