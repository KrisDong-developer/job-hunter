import { platformCriterion } from '../../types.js';
import { WAIQI_MAX_PAGE_SIZE } from './config.js';
/**
 * 把 `criteria.city` 归一化成城市名数组。
 *
 * 支持**多城市**：逗号分隔（`深圳,广州` 或中文顿号）、去空白、去重。
 * 平台接口的 `cityIds` 原生接受逗号拼接的多个城市码（`"248,247"`），
 * 一次请求就能覆盖多个目标城市 —— 因为服务端翻页是坏的（§3），单页抓取尤其值得把多城合并成一次过滤。
 */
export function splitCityList(city) {
    if (city === undefined || city === '')
        return [];
    const seen = new Set();
    const out = [];
    for (const part of city.split(/[,，、]/)) {
        const name = part.trim();
        if (name !== '' && !seen.has(name)) {
            seen.add(name);
            out.push(name);
        }
    }
    return out;
}
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
export function buildWaiqiSearchUrl(config, criteria) {
    const cities = splitCityList(criteria.city);
    if (cities.some((name) => config.cityCodes[name] === undefined)) {
        return null;
    }
    const params = new URLSearchParams();
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
        params.set('keyword', criteria.keyword);
    }
    // 页面自己的参数是 `posType`；与接口的 `type` 是同一件事。
    // 只在**非默认值**时才写进 URL —— 塞一个平台默认值会改变"什么都没配"时的行为。
    const posType = platformCriterion(criteria, 'type');
    if (posType !== '' && posType !== '2') {
        params.set('posType', posType);
    }
    const query = params.toString();
    const base = `${config.webBase}/position`;
    return query === '' ? base : `${base}?${query}`;
}
/**
 * 请求体字段名 —— **声明与构造共用这一份**。
 *
 * `index.ts` 里每个维度的 `wire.param` 直接引用这些常量，于是"声明说这个维度落到
 * 哪个参数"与"实际往哪个字段写"不可能分叉。这一份就是为那条教训而存在的：
 * 曾经声明里写着「行业 / 职能」两个维度，构造端写的是 `businessCategoryIdList` /
 * `posIds` —— 两份字面量，中间还隔着宿主的命名空间转换，漂移了没有任何东西会响，
 * 用户看到的就是"选了行业，抓回来的还是全量"。
 */
export const WAIQI_BODY_FIELDS = {
    keyword: 'name',
    city: 'cityIds',
    workExp: 'workExp',
    education: 'education',
    posInfo: 'posIds',
    businessCategory: 'businessCategoryIdList',
    /** 公司类型：**数组**（可多选），不是字符串 —— 平台初始请求里就是 `[]`。 */
    companyType: 'companyTypeList',
    type: 'type',
    sort: 'sort',
};
/** 接口请求体：页面初始值 + 用户配的筛选条件。 */
export function buildWaiqiRequestBody(criteria, cityCodes, page, size = WAIQI_MAX_PAGE_SIZE) {
    // `type` 是平台特有维度，走 `platform` 命名空间（见 `platformCriterion`）。
    const type = platformCriterion(criteria, 'type');
    const body = {
        // 页面初始值（实测自前端组件 state.queryParams）：type=2 / status=1 / expectId=0 / sort=0。
        expectId: 0,
        status: 1,
        [WAIQI_BODY_FIELDS.sort]: criteria.sort === undefined || criteria.sort === '' ? 0 : Number(criteria.sort),
        [WAIQI_BODY_FIELDS.type]: type === '' ? 2 : Number(type),
        // 站点初始请求里 `companyTypeList` **恒定存在**（空数组 = 不筛）——照抄，
        // 于是"没配"与"配了"在请求体指纹上分得开（对账测试靠这一点）。
        [WAIQI_BODY_FIELDS.companyType]: [],
        page,
        size,
        // `needAd=1` 与真实页面一致（服务端会在 records 里混入广告卡片，解析时按"没有 id"跳过）。
        needAd: 1,
    };
    // ⚠️ 关键词的键名是 `name`（实测）：`keyword` / `positionName` / `searchKey`
    // 都会被服务端忽略并原样返回全量 —— 那是最隐蔽的一种"筛选没生效"。
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
        body[WAIQI_BODY_FIELDS.keyword] = criteria.keyword;
    }
    if (criteria.city !== undefined && criteria.city !== '') {
        // 多城市：把逗号分隔的城市名逐个映射成平台码，再用逗号拼成 `cityIds`（平台原生接受）。
        // 城市码未配置就**不写这个键**（宁可搜全国，也不要写一个错的城市码）。
        // `buildWaiqiSearchUrl` 已经先拦过一次，这里是第二道。
        const codes = splitCityList(criteria.city)
            .map((name) => cityCodes[name])
            .filter((code) => code !== undefined);
        if (codes.length > 0)
            body[WAIQI_BODY_FIELDS.city] = codes.join(',');
    }
    const workExp = platformCriterion(criteria, 'workExp');
    if (workExp !== '')
        body[WAIQI_BODY_FIELDS.workExp] = workExp;
    const education = platformCriterion(criteria, 'education');
    if (education !== '')
        body[WAIQI_BODY_FIELDS.education] = education;
    // 职能 / 行业：前端取值域分别来自 `getPlatformTypes`（两级树）与 `getBusList`，
    // 我们在 config 里内置实测 seed（见 WAIQI_POS_INFO_SEED / WAIQI_BUSINESS_CATEGORY_SEED）。
    // `posIds` / `businessCategoryIdList` 均以**字符串**传（单值），与文档实测一致。
    const posInfo = platformCriterion(criteria, 'posInfo');
    if (posInfo !== '')
        body[WAIQI_BODY_FIELDS.posInfo] = posInfo;
    const businessCategory = platformCriterion(criteria, 'businessCategory');
    if (businessCategory !== '') {
        body[WAIQI_BODY_FIELDS.businessCategory] = businessCategory;
    }
    // 公司类型（2026-09-21 探针实测：45 项标签，请求体是**数组**）：多选 → 逗号分隔的 id。
    // 空 = 不筛（保持初始请求里的 `[]`）。
    const companyTypes = platformCriterion(criteria, 'companyType');
    if (companyTypes !== '') {
        const ids = companyTypes
            .split(',')
            .map((item) => Number.parseInt(item.trim(), 10))
            .filter((id) => Number.isFinite(id));
        if (ids.length > 0)
            body[WAIQI_BODY_FIELDS.companyType] = ids;
    }
    // ⚠️ 这是**给调用方自己塞参数**的逃生口（探针脚本会直接用 `criteria.extra`）。
    // 方案条件永远走不到这里：`criteriaToSearchCriteria` 的闭集规则把不在类型化槽位里的
    // 键一律放进 `platform` 命名空间（见 `plan-config.ts` 的 `TOP_LEVEL_SLOTS`）——
    // 正是这条兜底把 `posInfo` / `businessCategory` 当**参数名**发出去过。
    for (const [key, value] of Object.entries(criteria.extra ?? {}))
        body[key] = value;
    return body;
}
//# sourceMappingURL=urls.js.map