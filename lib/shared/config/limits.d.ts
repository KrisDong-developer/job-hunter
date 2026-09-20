/**
 * 请求体、附件、分页与导入导出的体积/条数闸门。
 */
/**
 * limits 相关常量（host 与 client 共享）。只放标量，不放运行时对象（§4.3）。
 */
/** 单次请求体上限（§4.7）。 */
export declare const MAX_BODY_BYTES: number;
/**
 * 用户**上传**的简历附件（PDF / DOCX）单文件上限。
 *
 * 为什么需要一个远比 `MAX_BODY_BYTES` 大的数：64KB 装不下任何一份真实的简历 PDF
 * （一页带排版的简历通常 100KB–500KB）。但"上传附件"这件事本身是必要的 ——
 * 手上已有的 PDF 必须能进来，否则简历库里只有本工具生成的那几份，
 * 投递归因（R6：这次投的是哪一版）就永远缺一半数据。
 *
 * 5MB 的依据是平台侧：主流招聘站对简历附件普遍限 5–10MB，
 * 更大的文件平台自己也会拒收 —— 我们没必要放行一个必然失败的体积。
 */
export declare const ATTACHMENT_MAX_BYTES: number;
/**
 * 上传那条路径的**请求体**上限。
 *
 * base64 会把字节膨胀 4/3（5MB → 6.7MB），再给 JSON 包装与文件名留一点余量，
 * 取 8MB。**只对上传这一条路径放宽**（见 `http.ts` 的 `bodyLimitFor`），
 * 其余接口继续受 64KB 约束 —— 体积闸门放宽的范围越小，出事的面积就越小。
 */
export declare const ATTACHMENT_BODY_MAX_BYTES: number;
/**
 * 「粘贴文本 → 结构化简历」的文本长度上限（字符）。
 *
 * 一份两页的中文简历约 2000–4000 字；20000 字足够容纳夸张的排版与多余空行，
 * 又能挡住"误把一篇文档全贴进来"（那既烧 token 又解析不出东西）。
 */
export declare const RESUME_IMPORT_MAX_CHARS = 20000;
/** 分页默认与上限（禁止无 LIMIT 的全表扫描进热路径，§4.1）。 */
export declare const PAGE_SIZE_DEFAULT = 20;
export declare const PAGE_SIZE_MAX = 100;
/**
 * 保存的筛选视图（`GET/PUT /jobs/views`）的条数与名字长度上限。
 *
 * 为什么要有上限：这份数据是**整份覆盖写**的（一次 PUT 换掉全部），
 * 无上限的话一次误操作就能把几百 KB 的 JSON 塞进 `setting` 表，
 * 而它的读取路径在每一次打开岗位库时都会走一遍。上限让"坏数据"在入口就被挡住，
 * 界面也能提前禁用"保存"而不是等被服务端拒绝。
 */
export declare const MAX_SAVED_JOB_VIEWS = 20;
export declare const MAX_SAVED_JOB_VIEW_NAME = 40;
/** 视图里每个多选项（城市 / 经验 / 学历 / 屏蔽标注）最多几项。 */
export declare const MAX_SAVED_JOB_VIEW_ITEMS = 20;
/**
 * 「导出选中岗位」（`GET /jobs/export`）一次最多几条。
 *
 * 上限来自传输方式：id 列表拼在 URL 上（见该路由的注释），500 个 id 约 2–3KB，
 * 远在 8KB 的常见 URL 上限之内，而导出的 CSV 也就一二百 KB。再大就该走
 * 全量导出（`/data/export`）而不是"选中"这个动作了。
 */
export declare const MAX_JOB_EXPORT_IDS = 500;
/**
 * 一次导入的**行数上限**。
 *
 * 存在的理由不是洁癖：导入的行会直接落进岗位库，而"粘了一份几万行的表进来"
 * 既会撑爆内存，也会把岗位库变成噪音。超过就明确拒绝，让用户分批。
 */
export declare const IMPORT_MAX_ROWS = 2000;
/**
 * 数据导出归档里**允许的附件总字节上限**。
 *
 * 归档把 `files/` 的原文件一起打包，而用户可以导出很多版简历附件；
 * 无上限会让一次 GET 把宿主内存吃光（响应体是先在内存里拼出来的）。
 * 超限时**只导出结构化数据**并在响应里如实说明少了什么。
 */
export declare const EXPORT_ARCHIVE_MAX_BYTES: number;
//# sourceMappingURL=limits.d.ts.map