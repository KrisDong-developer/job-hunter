/**
 * 神仙外企的 URL 与请求体构造 —— **宿主机侧**（不碰 `document`）。
 *
 * 关键认知：筛选**不在 URL 里**。平台把条件放在 POST body 里，URL 只承载页面自己的
 * `keyword` / `posType`。完整实测记录（哪些键生效、哪些被忽略）见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js';
import type { WaiqiConfig } from './config.js';
/**
 * 把 `criteria.city` 归一化成城市名数组。
 *
 * 支持**多城市**：逗号分隔（`深圳,广州` 或中文顿号）、去空白、去重。
 * 平台接口的 `cityIds` 原生接受逗号拼接的多个城市码（`"248,247"`），
 * 一次请求就能覆盖多个目标城市 —— 因为服务端翻页是坏的（§3），单页抓取尤其值得把多城合并成一次过滤。
 */
export declare function splitCityList(city: string | undefined): string[];
/**
 * 构造**页面外壳地址**（人打开时看到的那个）。
 *
 * 关键认知：筛选**不在 URL 里**。平台把条件放在 POST body 里，
 * URL 只承载页面自己的 `keyword` / `posType`。所以这里构造出来的地址
 * 是"人能看着核对"的入口，真正的筛选由 `buildWaiqiRequestBody` 负责。
 *
 * 城市我们仍然在这里校验：任一城市没配就直接返回 `null`（**不猜**），
 * 否则"城市没配"会变成一次静默的全国搜索。支持逗号分隔的多城市。
 */
export declare function buildWaiqiSearchUrl(config: WaiqiConfig, criteria: SearchCriteria): string | null;
/**
 * 请求体字段名 —— **声明与构造共用这一份**。
 *
 * `index.ts` 里每个维度的 `wire.param` 直接引用这些常量，于是"声明说这个维度落到
 * 哪个参数"与"实际往哪个字段写"不可能分叉。这一份就是为那条教训而存在的：
 * 曾经声明里写着「行业 / 职能」两个维度，构造端写的是 `businessCategoryIdList` /
 * `posIds` —— 两份字面量，中间还隔着宿主的命名空间转换，漂移了没有任何东西会响，
 * 用户看到的就是"选了行业，抓回来的还是全量"。
 */
export declare const WAIQI_BODY_FIELDS: {
    readonly keyword: "name";
    readonly city: "cityIds";
    readonly workExp: "workExp";
    readonly education: "education";
    readonly posInfo: "posIds";
    readonly businessCategory: "businessCategoryIdList";
    readonly type: "type";
    readonly sort: "sort";
};
/** 接口请求体：页面初始值 + 用户配的筛选条件。 */
export declare function buildWaiqiRequestBody(criteria: SearchCriteria, cityCodes: Record<string, number>, page: number, size?: number): Record<string, unknown>;
//# sourceMappingURL=urls.d.ts.map