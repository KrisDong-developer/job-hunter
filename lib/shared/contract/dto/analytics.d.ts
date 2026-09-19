/**
 * analytics 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */
/**
 * 看板的全局筛选条件（§13 U8）。
 *
 * 有一条**硬约束**必须靠类型与文档记住：`greeting` / `message` / `interview` 三张表
 * **没有 `resume_id`**，所以「简历版本」与「方向」只对**投递链路**成立；
 * 接触段（打招呼/送达/已读/回复）对这两个条件**不生效**，服务层会显式忽略并在 note 里说明
 * —— 一刀切地套上去会让接触段静默变成 0，看起来像"这版简历没人理"，那是假结论。
 */
export interface AnalyticsFilter {
    /** ISO 时间下界（含）。投递链路按 `sent_at`；薪资模块按岗位的 `first_seen_at`。 */
    from?: string;
    /** ISO 时间上界（含）。 */
    to?: string;
    /** 只作用于投递链路的简历版本。 */
    resumeId?: number;
    /** 简历里填的方向（展示层用它当岗位关键词用）。只作用于投递链路。 */
    direction?: string;
    /** 岗位城市：这三张表都没有城市列，要 JOIN `job`。 */
    city?: string;
    /** 岗位标题关键词，同样是 JOIN `job`。 */
    keyword?: string;
}
/** 漏斗的一层。 */
export interface FunnelStepDto {
    key: string;
    label: string;
    count: number;
    /**
     * 相对上一层的转化率（0-1）；`null` 表示**这一层不能算转化率**。
     *
     * 两种 `null`：
     *   1. 第一层（没有上一层）；
     *   2. 上一层的**总体不同** —— 接触漏斗（打招呼/送达/已读/回复）与投递漏斗
     *      （投递/面试/Offer）是两个不同的总体，用"投递数 ÷ 回复数"会算出 >100% 的转化率。
     *      一个能算出 120% 的转化率会让人不再信任整张图。
     */
    rate: number | null;
    /** 这一层属于哪个总体。画图时在总体切换处画一条分隔线。 */
    population: 'contact' | 'application';
}
/** `GET /analytics/funnel`：投递漏斗（§13 U8）。 */
export interface FunnelDto {
    steps: FunnelStepDto[];
    /** 样本量太小时必须显式说出来，否则百分比会骗人。 */
    sampleSize: number;
    /**
     * 样本是否够谈比率（`MIN_SAMPLE`）。
     *
     * 由 host 判定、界面直接渲染，**不让前端再算一遍** —— 阈值只留一份
     * （与 `SalaryBoxDto.withinBox`、`ResumeCompareCellDto.thin` 同一个理由：
     * 两边各算一次必然漂移）。
     */
    enoughSample: boolean;
    note: string;
}
/** 一组归因对比（按渠道 / 按简历版本 / 按平台）。 */
export interface AttributionRowDto {
    key: string;
    label: string;
    total: number;
    replied: number;
    interviewed: number;
    offered: number;
    /** 这一行自己的样本是否够（`MIN_SAMPLE`）—— 界面据此决定要不要高亮它。 */
    enoughSample: boolean;
    /** 回复率 / 面试率 / Offer 率（0-1；分母是 total）。 */
    replyRate: number;
    interviewRate: number;
    offerRate: number;
}
export interface AttributionDto {
    byChannel: AttributionRowDto[];
    byResume: AttributionRowDto[];
    sampleSize: number;
    /** 整体样本是否够（`MIN_SAMPLE`）。 */
    enoughSample: boolean;
    note: string;
}
//# sourceMappingURL=analytics.d.ts.map