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
export const GUOPIN_EXPERIENCE_OPTIONS = [
    { value: '112QSAqm', label: '在校生' },
    { value: '114Mh7Wi', label: '应届生' },
    { value: '113upZvj', label: '经验不限' },
    { value: '11ivfg6', label: '1年以内' },
    { value: '113aJGtA', label: '1-3年' },
    { value: '112tTY6B', label: '1-5年' },
    { value: '116PfdYT', label: '3-5年' },
    { value: '112eGWE7', label: '5-10年' },
    { value: '113VebCw', label: '10-15年' },
    { value: '11PN5Ln', label: '15-20年' },
    { value: '114JPLBk', label: '20年以上' },
];
/** `job_major`（专业）。 */
export const GUOPIN_MAJOR_OPTIONS = [
    { value: '11862Vf', label: '哲学' },
    { value: '11ccxHW', label: '经济学' },
    { value: '116QgJd8', label: '法学' },
    { value: '116YbyXD', label: '教育学' },
    { value: '116fSy1u', label: '文学' },
    { value: '114pv28z', label: '历史学' },
    { value: '116bu26v', label: '理学' },
    { value: '117CvKmE', label: '工学' },
    { value: '116bxSGY', label: '农学' },
    { value: '116jx4Kv', label: '医学' },
    { value: '113bqQex', label: '管理学' },
    { value: '1135rniV', label: '艺术学' },
    { value: '114dVttH', label: '农林牧渔' },
    { value: '114NAQcP', label: '资源环境与安全' },
    { value: '117TqYbq', label: '能源动力与材料' },
    { value: '111yjXE', label: '土木建筑' },
    { value: '117FfQHc', label: '水利' },
    { value: '115ZTcrL', label: '装备制造' },
    { value: '114esiYo', label: '生物与化工' },
    { value: '1148Fu82', label: '轻工纺织' },
    { value: '116GU7EM', label: '食品药品与粮食' },
    { value: '11687tdn', label: '交通运输' },
    { value: '116eJJ16', label: '电子与信息' },
    { value: '112pgkKK', label: '医药卫生' },
    { value: '116XfrEc', label: '财经商贸' },
    { value: '114gCo6y', label: '旅游' },
    { value: '116ryQkz', label: '文化艺术' },
    { value: '11T3TVS', label: '新闻传播' },
    { value: '11kvV6m', label: '教育与体育' },
    { value: '117Bgmw4', label: '公安与司法' },
    { value: '115dwBfu', label: '公共管理与服务' },
    { value: '117DmuL8', label: '军事学' },
    { value: '113qSvBw', label: '交叉学科' },
    { value: '112wGZgg', label: '其他专业' },
];
//# sourceMappingURL=dictionaries.js.map