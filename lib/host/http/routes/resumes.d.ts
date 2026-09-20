import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
export declare function list(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function create(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function get(ctx: RouteContext): Promise<RouteResult | undefined>;
/**
 * `POST /resumes/import` —— 把粘贴的简历文本解析成结构化（A3）。
 *
 * ## 为什么收的是**文本**而不是文件
 *
 * 本仓库没有 PDF/DOCX 解析库。硬写一个"看起来能跑"的解析器，结果是**脏数据进简历库**
 * ——而那正是本仓库最不愿写进去的东西（宁可不做，也不写错的）。
 * 用户从 PDF / Word 里选中复制再粘进来即可（两者都能复制文本）；
 * 想把 PDF 原样存档就调 `POST /resumes/:id/files`。
 *
 * ## 为什么 200 与 201 都可能
 *
 * `save: false` 时只解析、不落库（返回 200）——那是"先看看解析成什么样"的用法；
 * 落库成功返回 201，与其他创建类端点一致。
 */
export declare function importResume(ctx: RouteContext): Promise<RouteResult | undefined>;
/**
 * `POST /resumes/:id/files` —— 上传用户**自己的** PDF / DOCX 作为附件（R9 / D7）。
 *
 * 形状（`fileName` + `contentBase64`）是刻意的：
 *   * 不收**路径**——路径会让"上传"变成"读宿主任意文件"，与本仓库
 *     `system/reveal` 不收路径是同一条纪律；
 *   * 体积与文件头校验在**领域层**（`uploadFile`），这一层只做类型检查 ——
 *     这样界面、工具与 HTTP 三条入口过的是同一套判断。
 */
export declare function uploadFile(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function patch(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function remove(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function duplicate(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function setDefault(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function preview(ctx: RouteContext): Promise<RouteResult | undefined>;
/** `export` 是保留字、不能当函数名 —— 所以导出名是 `exportResume`，路由表里也写这个名字。 */
export declare function exportResume(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function files(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function tailor(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function tailoringsList(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function tailoringsAdopt(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function greetingTemplatesList(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function greetingTemplateGenerate(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function greetingTemplateSave(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function greetingTemplateRemove(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=resumes.d.ts.map