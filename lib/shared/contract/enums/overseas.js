/**
 * overseas 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
// 海外支线（§4.M）
/**
 * 工签/Sponsorship 立场（§4.M M4）。
 *
 * `unknown` 是一等取值而不是"没填"：**识别不出来就必须说识别不出来**。
 * 把"没看到 no sponsorship 字样"当成"提供担保"，会让用户投一堆注定无效的岗位。
 */
export const VISA_STANCES = ['provides', 'no_sponsorship', 'local_only', 'unknown'];
export const VISA_STANCE_LABEL = {
    provides: '提供签证担保',
    no_sponsorship: '不提供担保',
    local_only: '仅限本地身份',
    unknown: '未识别',
};
/** 工作模式（§4.M M5）。 */
export const REMOTE_KINDS = ['onsite', 'hybrid', 'remote', 'unknown'];
export const REMOTE_KIND_LABEL = {
    onsite: '坐班',
    hybrid: '混合',
    remote: '远程',
    unknown: '未识别',
};
/** Cover Letter 语言（M2：与简历语言独立，海外岗位通常要英文）。 */
export const COVER_LETTER_LANGUAGES = ['en', 'zh'];
//# sourceMappingURL=overseas.js.map