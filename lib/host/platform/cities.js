/**
 * 跨平台城市目录（批次 3）。
 *
 * ## 它要解决的问题
 *
 * "用户填的这个城市，我选的这几个平台到底支不支持" —— 这件事以前**没有任何地方
 * 回答得了**：城市码散在 8 个适配器里，格式各不相同（字符串码 / 数字码 / 省级码 /
 * 中文名直传 / 空表），而界面只拿到"第一个声明了 city 的平台"的那张表。
 *
 * 后果分两类，都很难自查：
 *
 *   * **会失败的**：`guopin` / `hiredchina` 的城市表是**空**的，而空表在这里的含义是
 *     "一个城市都别给"（带城市一律拒绝）—— 用户从界面上看不出区别，只会在
 *     抓取那一步看到这个平台整轮失败；
 *   * **会误报的**：`lagou` 的 city 是自由文本（中文名直接进 URL），
 *     却因为"表里有 20 个建议值"被当成封闭取值域 —— 填别的城市会收到一条**假的**警告。
 *     两个方向的错都来自同一个偷懒：**闭不闭，从 `values` 空不空推不出来**。
 *
 * ## 它是什么，不是什么
 *
 * 是：一份**规范城市表**（"哪些名字算城市、按什么顺序"）＋由注册表派生的**支持度判定**。
 *
 * 不是：取值域的权威。某个平台支持哪些城市，权威永远是**那个平台自己声明的**
 * `criteriaDimensions`（加城市仍然只需改适配器或写 DB 覆盖）。每个平台的**码**
 * 也本来就不可能统一 —— 平台自己的编号体系，硬合成一张表只会多一层会漂移的副本。
 * 目录统一的是**城市集合与写法**，不是码。
 */
import { normalizeCityForDedupe } from '../util/dedupe.js';
/**
 * 规范城市表：**跨平台唯一的中文城市名集合**。
 *
 * 顺序即界面上城市下拉的顺序：**四大一线在前，其余按省份成组** —— 不是字母序，
 * 因为这个列表是给人扫的，而"我所在的城市"与地理直觉比拼音更有用。
 *
 * 收录范围是各平台码表的**并集**（当前 46 个）；把新城市加进某个平台的码表时，
 * 如果它不在这个列表里，`test/platform/cities.test.ts` 会失败并提醒你补上来。
 */
export const CITY_DIRECTORY = [
    // 直辖市
    '北京',
    '上海',
    '天津',
    '重庆',
    // 广东
    '广州',
    '深圳',
    '东莞',
    '佛山',
    '珠海',
    '惠州',
    '中山',
    // 江苏
    '南京',
    '苏州',
    '无锡',
    '常州',
    '徐州',
    '南通',
    // 浙江
    '杭州',
    '宁波',
    '温州',
    '嘉兴',
    // 山东 / 福建
    '青岛',
    '济南',
    '烟台',
    '潍坊',
    '福州',
    '厦门',
    '泉州',
    // 中西部省会
    '成都',
    '武汉',
    '长沙',
    '郑州',
    '合肥',
    '西安',
    '南昌',
    '南宁',
    '昆明',
    '贵阳',
    '兰州',
    '银川',
    '乌鲁木齐',
    '海口',
    // 东北 + 华北
    '沈阳',
    '大连',
    '长春',
    '哈尔滨',
    '石家庄',
    '太原',
    '呼和浩特',
    // 港澳台（神仙外企码表里有，它们也是真实岗位市场）
    '香港',
    '澳门',
    '台北',
];
const DIRECTORY_INDEX = new Map(CITY_DIRECTORY.map((name, index) => [name, index]));
/**
 * 归一化成目录里的规范名；不在目录里返回 `null`（**不猜**）。
 *
 * 归一化复用 `normalizeCityForDedupe`（同一套规则）而不是再写一份：
 * 「深圳·福田」「深圳-福田」「深圳市」在**去重**与**城市目录**两处必须给出同一个答案，
 * 两套实现迟早会分叉，而分叉的表现是"去重认它是深圳、城市校验说不认识"。
 */
export function canonicalCityOf(input) {
    const name = normalizeCityForDedupe(input);
    return DIRECTORY_INDEX.has(name) ? name : null;
}
/**
 * 按目录顺序排一批城市名（目录外的排在最后，保持传入顺序）。
 *
 * 界面上需要它：多平台时城市取值域是**并集**，而并集如果按平台顺序拼，
 * 换一个平台勾选顺序就会让下拉列表重排 —— 用户会以为选项变了。
 */
export function orderCities(names) {
    const unique = [...new Set(names)];
    return unique.sort((left, right) => {
        const a = DIRECTORY_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER;
        const b = DIRECTORY_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER;
        if (a === b)
            return 0;
        return a - b;
    });
}
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
export function citySupportOf(adapter, city) {
    const dimension = adapter.criteriaDimensions.find((item) => item.key === 'city');
    if (dimension === undefined)
        return 'free-text';
    const closed = dimension.closed ?? dimension.values.length > 0;
    if (!closed)
        return 'free-text';
    return dimension.values.some((item) => item.value === city) ? 'supported' : 'unsupported';
}
//# sourceMappingURL=cities.js.map