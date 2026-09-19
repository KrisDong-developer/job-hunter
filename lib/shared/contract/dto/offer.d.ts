/**
 * offer 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */
import type { SalaryBasis } from '../enums/analytics.js';
import type { OfferState } from '../enums/offer.js';
import type { ApplicationStage } from '../enums/pipeline.js';
import type { OfferComp, OfferCompKind } from '../../domain/offer-comp.js';
/** 一条 Offer（§4.H H1/H3/H4）。 */
export interface OfferDto {
    id: number;
    companyId: number | null;
    /** 公司名（公司不在库里时用登记时手填的那个）。 */
    companyName: string;
    jobId: number | null;
    jobTitle: string | null;
    applicationId: number | null;
    /** 关联投递的当前阶段（`null` = 没关联投递）。 */
    applicationStage: ApplicationStage | null;
    /** offer 的岗位名（手填；有 jobId 时界面可以并排显示）。 */
    role: string;
    comp: OfferComp;
    /** 年**现金**总包（元）；算不出来为 null（不假装知道）。 */
    annualCash: number | null;
    /** Offer 截止时间（ISO）；不填为 null。 */
    deadline: string | null;
    /** 距截止还有几天（负数 = 已过期）；没有 deadline 时为 null。 */
    daysLeft: number | null;
    state: OfferState;
    note: string | null;
    createdAt: string;
    updatedAt: string;
}
/** Offer 截止提醒的一条（U0 与提醒体系用，H3）。 */
export interface OfferDeadlineDto {
    id: number;
    companyName: string;
    role: string;
    deadline: string;
    /** 距截止还有几天（负数 = 已过期）。 */
    daysLeft: number;
    state: OfferState;
}
/** `POST /offers/compare` 的一行（H1 对比表）。 */
export interface OfferCompareRowDto {
    key: string;
    label: string;
    /** 显示口径（金额/比例/天/文本…），界面据此决定对齐方式。 */
    kind: OfferCompKind;
    /** 每个 offer 的显示值；`null` = 未填写（**不是 0**）。 */
    values: Array<string | null>;
    /** 数值型字段的原始值（文本与布尔为 null），用于算"差多少"。 */
    numbers: Array<number | null>;
    /** 这一行是否存在差异（全部相同、或全部未填 = false）。 */
    differs: boolean;
    /** 更好的是哪一个（下标）；`null` = 不判断（文本、或方向不唯一）。 */
    bestIndex: number | null;
    /** 与最优值相差多少（金额 = 元，天数 = 天）；只有能给方向的行才有。 */
    gaps: Array<number | null>;
}
/** `POST /offers/compare`（H1 并排对比 + H2 谈薪支撑）。 */
export interface OfferCompareDto {
    offers: OfferDto[];
    rows: OfferCompareRowDto[];
    /** 规则结论（不依赖模型）：谁的总包最高、谁的截止最近、谁缺哪些关键项。 */
    facts: string[];
    /** 模型建议；用途 `offer_compare` 关闭或模型不可用时为 null。 */
    advice: string | null;
    via: 'llm' | 'rule';
    /** 降级说明与隐私说明（如实展示）。 */
    notes: string[];
}
/** 薪资分位（`job_report` 用）。 */
export interface SalaryBandDto {
    scope: string;
    count: number;
    min: number | null;
    p25: number | null;
    median: number | null;
    p75: number | null;
    max: number | null;
}
/**
 * 一个箱线图（F1）。
 *
 * 除了五数概括，还把 **P25–P75 区间**（箱体本身）单独给出来：
 * 界面上要把它高亮，而"高亮哪一段"必须是 host 算好的同一个区间，
 * 不能让前端再算一遍（两边各算一次必然漂移）。
 */
export interface SalaryBoxDto {
    /** 口径标签（含单位），界面直接显示，不再自己拼。 */
    basis: SalaryBasis;
    basisLabel: string;
    count: number;
    min: number | null;
    p25: number | null;
    median: number | null;
    p75: number | null;
    max: number | null;
    /** 落进 `[p25, p75]` 的样本数 —— 箱体里装了多少条要有据可查。 */
    withinBox: number;
}
/**
 * `GET /analytics/salary/box`（F1）。
 */
export interface SalaryBoxChartDto {
    box: SalaryBoxDto;
    /** 供界面画刻度的可选口径（同一个方案在另一种口径下的箱体），`null` = 该口径无样本。 */
    alternate: SalaryBoxDto | null;
    /** 箱体样本是否够（`MIN_SAMPLE`）—— 不够时界面只给分布、不给结论。 */
    enoughSample: boolean;
    note: string;
}
/**
 * `GET /analytics/salary/baseline`（F2）—— **本地基准对比**。
 *
 * 硬约束：基准**只能**来自用户自己抓到的岗位库。
 * 本项目没有服务器、没有行业数据源，编一个"行业基准"就是把假信息画进界面。
 */
export interface SalaryBaselineDto {
    scope: string;
    /** 该城市/关键词下的**全体**岗位分布。 */
    all: SalaryBoxDto;
    /** 用户**投递过**的那些岗位分布（按岗位去重）。 */
    applied: SalaryBoxDto;
    /** 两者中位数之差（投递 − 全体）；任一边没样本时为 null。 */
    medianGap: number | null;
    /** 投递样本是否够下结论（`MIN_SAMPLE`）。不够就**只看分布，不谈高下**。 */
    enoughSample: boolean;
    note: string;
}
//# sourceMappingURL=offer.d.ts.map