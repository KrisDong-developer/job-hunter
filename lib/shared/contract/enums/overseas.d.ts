/**
 * overseas 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
/**
 * 工签/Sponsorship 立场（§4.M M4）。
 *
 * `unknown` 是一等取值而不是"没填"：**识别不出来就必须说识别不出来**。
 * 把"没看到 no sponsorship 字样"当成"提供担保"，会让用户投一堆注定无效的岗位。
 */
export declare const VISA_STANCES: readonly ["provides", "no_sponsorship", "local_only", "unknown"];
export type VisaStance = (typeof VISA_STANCES)[number];
export declare const VISA_STANCE_LABEL: Record<VisaStance, string>;
/** 工作模式（§4.M M5）。 */
export declare const REMOTE_KINDS: readonly ["onsite", "hybrid", "remote", "unknown"];
export type RemoteKind = (typeof REMOTE_KINDS)[number];
export declare const REMOTE_KIND_LABEL: Record<RemoteKind, string>;
/** Cover Letter 语言（M2：与简历语言独立，海外岗位通常要英文）。 */
export declare const COVER_LETTER_LANGUAGES: readonly ["en", "zh"];
export type CoverLetterLanguage = (typeof COVER_LETTER_LANGUAGES)[number];
//# sourceMappingURL=overseas.d.ts.map