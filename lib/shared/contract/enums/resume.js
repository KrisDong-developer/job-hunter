/**
 * resume 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
// 简历
/**
 * 简历版本态。
 *
 * 刻意只有两个值：`archived` 是"留着但不再投"，不是删除 ——
 * 简历是用户资产，**只能由用户显式删除**（§18 保留策略）。
 */
export const RESUME_STATES = ['active', 'archived'];
/**
 * 简历语言。
 *
 * 海外方向**不做中文机翻**（§4.M / D-11），所以语言是简历的一等属性：
 * 中英各是一份独立维护的版本，而不是同一份的两个渲染。
 */
export const RESUME_LANGUAGES = ['zh', 'en'];
export const RESUME_LANGUAGE_LABEL = {
    zh: '中文',
    en: '英文',
};
export const RESUME_STATE_LABEL = {
    active: '启用中',
    archived: '已归档',
};
/** 排版模板（R3：至少 2 套）。 */
export const RESUME_TEMPLATES = ['concise', 'professional'];
export const RESUME_TEMPLATE_LABEL = {
    concise: '简洁',
    professional: '专业',
};
/** 导出格式（§17 R1/R2）。 */
export const RESUME_FORMATS = ['pdf', 'docx', 'html'];
//# sourceMappingURL=resume.js.map