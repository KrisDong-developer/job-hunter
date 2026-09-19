/**
 * 工具结果的**文本契约** —— 宿主生产、客户端 toolview 消费，两边共用这一个文件。
 *
 * 为什么要有这么一层：客户端 toolview 只能拿到工具的**文本内容块**，
 * 拿不到结构化 `value`。要做岗位卡片就只能约定一种格式 ——
 * 那就把「生产」与「解析」放进同一个模块，改一边就必然会动另一边（同 labels.ts 的思路）。
 *
 * 格式刻意选得**同时对人可读**：这些行也是模型看到的上下文（§22.5 上下文友好），
 * 所以不能写成 JSON，也不能塞整段 JD。
 */
/** 列表行：#12 高级前端工程师 · 腾讯科技 · 深圳 南山 · 25-40K · 粗筛 82 */
export declare const JOB_LIST_LINE: RegExp;
/** 列表行内的字段分隔符。 */
export declare const LIST_FIELD_SEP = " \u00B7 ";
export interface JobListLine {
    id: number;
    title: string;
    company: string;
    city: string;
    salary: string;
    score: string;
}
export interface JobListLineInput {
    id: number;
    title: string;
    companyName: string | null;
    city: string;
    district: string;
    salaryRaw: string;
    matchScore: number | null;
    flagTypes: string[];
}
/** 把一条岗位渲染成卡片行（客户端会按 `LIST_FIELD_SEP` 切开）。 */
export declare function formatJobListLine(job: JobListLineInput): string;
export declare function parseJobListLine(line: string): JobListLine | undefined;
/** 详情卡片的键（客户端按这些键渲染成一行行）。 */
export declare const DETAIL_KEYS: {
    readonly company: "公司";
    readonly place: "地点";
    readonly salary: "薪资";
    readonly requirement: "要求";
    readonly match: "粗筛匹配";
    readonly flags: "标注";
    readonly jd: "JD 摘要";
    readonly url: "链接";
};
export type DetailKey = (typeof DETAIL_KEYS)[keyof typeof DETAIL_KEYS];
/** 详情卡片的第一行（标题行，没有键名）。 */
export declare function formatJobDetailTitle(id: number, title: string, company: string | null): string;
/** 一行 `键：值`。 */
export declare function formatDetailLine(key: DetailKey, value: string): string;
export interface DetailLine {
    key: string;
    value: string;
}
/** 解析详情卡片的正文行；标题行返回 `null`（客户端自己渲染标题）。 */
export declare function parseDetailLines(text: string): Array<DetailLine | null>;
/**
 * 把 JD 压成**摘要**再外发/展示。
 *
 * 为什么不给全文：§22.5 明确「工具返回不塞入完整 JD」。模型需要的是"这岗位要什么"，
 * 全文在界面里看即可，塞进上下文只会挤掉真正有用的东西。
 */
export declare const JD_SUMMARY_CHARS = 400;
export declare function summarizeJd(text: string | null, limit?: number): string;
//# sourceMappingURL=tool-format.d.ts.map