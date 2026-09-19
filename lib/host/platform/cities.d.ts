import type { SiteAdapter } from './types.js';
/**
 * 规范城市表：**跨平台唯一的中文城市名集合**。
 *
 * 顺序即界面上城市下拉的顺序：**四大一线在前，其余按省份成组** —— 不是字母序，
 * 因为这个列表是给人扫的，而"我所在的城市"与地理直觉比拼音更有用。
 *
 * 收录范围是各平台码表的**并集**（当前 373 个：2026-09-19 由猎聘城市弹窗的采样
 * 从 52 个扩到 373 个）；把新城市加进某个平台的码表时，
 * 如果它不在这个列表里，`test/platform/cities.test.ts` 会失败并提醒你补上来。
 */
export declare const CITY_DIRECTORY: readonly string[];
/**
 * 归一化成目录里的规范名；不在目录里返回 `null`（**不猜**）。
 *
 * 归一化复用 `normalizeCityForDedupe`（同一套规则）而不是再写一份：
 * 「深圳·福田」「深圳-福田」「深圳市」在**去重**与**城市目录**两处必须给出同一个答案，
 * 两套实现迟早会分叉，而分叉的表现是"去重认它是深圳、城市校验说不认识"。
 */
export declare function canonicalCityOf(input: string): string | null;
/**
 * 按目录顺序排一批城市名（目录外的排在最后，保持传入顺序）。
 *
 * 界面上需要它：多平台时城市取值域是**并集**，而并集如果按平台顺序拼，
 * 换一个平台勾选顺序就会让下拉列表重排 —— 用户会以为选项变了。
 */
export declare function orderCities(names: readonly string[]): string[];
/** 一个平台怎么处理城市条件。 */
export type CitySupport = 
/** 它自己的码表里有这个城市 —— 能跑。 */
'supported'
/** 码表里**没有**它（含空表）—— 选了这个城市它会拒绝或返回空。 */
 | 'unsupported'
/** 不查表、原样接收（自由文本）。 */
 | 'free-text';
/**
 * 这个平台对「城市 = city」的处理方式。
 *
 * 判据只有一条：**适配器自己声明的 `closed`**（`criteriaDimensions` 的 city 维度）：
 *   * `closed === false` → 自由文本（表里的值只是**建议**）；
 *   * `closed === true`，或没声明但 `values` 非空 → 封闭取值域；
 *   * 没声明 city 维度 → 不参与城市条件（当自由文本看待，没有可校验的东西）。
 *
 * 为什么必须显式声明而不是从 `values` 推：`guopin` 是"空表 + 一律拒绝"，
 * `indeed` 是"空表 + 原样接收" —— 两者在数据上一模一样。
 */
export declare function citySupportOf(adapter: SiteAdapter, city: string): CitySupport;
//# sourceMappingURL=cities.d.ts.map