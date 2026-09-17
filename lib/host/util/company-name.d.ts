/**
 * 公司名归一化（§4.10.1 的**第 1 级**：归一化）。
 *
 * 只做「去地域前缀 + 去公司后缀 + 全半角/大小写/空白统一」，产出用于建索引与精确比对的键。
 * 第 2~5 级（别名表 / 包含关系 / 编辑距离 / 不确定不合并）属于去重漏斗，在 P4 与
 * `dedup_group` 一起实现 —— **这里刻意不做任何模糊合并**（铁律 1：不确定宁可不合并）。
 */
/**
 * 归一化公司名。
 * @param raw 原始公司名，如 `北京字节跳动科技有限公司`
 * @returns 归一化键，如 `字节跳动`；输入不可用时返回空串
 */
export declare function normalizeCompanyName(raw: string): string;
/**
 * 同一条公司名的两个形态是否指向同一实体 —— **只做精确比对**。
 * 模糊合并留给 P4 的去重漏斗，并必须记录依据（`dedup_group.basis`）。
 */
export declare function sameCompany(a: string, b: string): boolean;
//# sourceMappingURL=company-name.d.ts.map