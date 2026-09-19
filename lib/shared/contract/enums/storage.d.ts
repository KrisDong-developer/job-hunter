/**
 * storage 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
/**
 * 导出格式：结构化 JSON / 分表 CSV（打成一个 zip）/ 全量归档（含附件）。
 *
 * 写成取值数组而不是内联联合：路由侧的校验（`data.ts`）与内容类型表都要按它走，
 * 有数组才能 `includes` 一次判完，不必在三个地方各列一遍同样的三个字符串。
 */
export declare const DATA_EXPORT_FORMATS: readonly ["json", "csv", "archive"];
export type DataExportFormat = (typeof DATA_EXPORT_FORMATS)[number];
//# sourceMappingURL=storage.d.ts.map