/**
 * 神仙外企的配置面：字段名 / 选择器接口 / 值域 / 城市码表 / 种子表 / 判墙信号常量 + `merge*`。
 *
 * 纯数据 + 纯函数，**不含**任何 `document` / 页面上下文逻辑（那些在 `./page.ts`）。
 * 完整实测记录（接口契约、两条硬事实、robots 取舍）见 `./index.ts` 文件头。
 */
/** 页面外壳地址（人看的入口）。 */
export const WAIQI_WEB_BASE = 'https://www.waiqi.com';
/** 接口根：列表接口在 `position-service` 下。 */
export const WAIQI_API_BASE = 'https://backservice.offerxiansheng.com/api/position-service';
/** 列表接口路径。`/social-position/foreign/...` 就是外企平台自己在用的那个。 */
export const WAIQI_LIST_PATH = '/social-position/foreign/page-list';
/**
 * 详情接口路径（GET，`?id=<岗位id>`）。
 *
 * 2026-09-21 实测（匿名、无 access-token）：
 * `code=1000` 且 `loginStatus=0` 时仍返回**完整** `data.description`（JD 原文，
 * 外企岗常为英文）与 `data.translateDescription`（平台提供的中文翻译）。
 * 注意详情响应的城市键是 `cityNamelist`（小写 l），与列表的 `cityNameList` **不是同一个拼写**。
 */
export const WAIQI_DETAIL_PATH = '/social-position/details';
/**
 * 单页容量上限（平台硬上限，不是我们保守）。
 *
 * 实测：`size=50` 正常返回 50 条；`size=100` → `code=1010, message="size最大为50"`。
 */
export const WAIQI_MAX_PAGE_SIZE = 50;
/**
 * 最多抓几页 —— **只能是 1**。
 *
 * 实测：`page=2`（乃至 3、4）一律返回 `code=1000` + `positionVO.records=[]`，
 * 与 `size` 无关。也就是说第二页永远拿不到数据。
 * 与其声明 5 页然后静默返回 0 条，不如老实写 1：
 * **"抓不到"要让用户看见，不能伪装成"没有新岗位"**（§4.2.4）。
 */
export const WAIQI_MAX_PAGES = 1;
/**
 * 职位范围（页面顶部的两个 tab）。
 *
 * 实测：`type=2` 是页面默认（外企），`type=1` 放宽到合资/民营；
 * `type=0` 会让服务端报 `code=999 系统数据异常`，所以值域里没有它。
 */
export const WAIQI_TYPE_OPTIONS = [
    { value: '2', label: '外企职位（默认）' },
    { value: '1', label: '不限（含合资 / 民营）' },
];
/**
 * 工作经验取值域。
 *
 * 值域来自实测：`workExp=N` 的返回量呈钟形（0=不限、1=1年以下、2=1-3年、
 * 3=3-5年、4=5-10年、5=10年以上），`6`/`7` 恒为 0 条 —— 说明只有 0~5 是有效档位。
 * 与页面筛选项 `exp = ['不限经验','1年以下','1-3年','3-5年','5-10年','10年以上']` 一致。
 */
export const WAIQI_WORK_EXP_OPTIONS = [
    { value: '0', label: '不限经验' },
    { value: '1', label: '1年以下' },
    { value: '2', label: '1-3年' },
    { value: '3', label: '3-5年' },
    { value: '4', label: '5-10年' },
    { value: '5', label: '10年以上' },
];
/**
 * 学历取值域。
 *
 * 来源：前端 `getEducationEnum({scene:'not_limit'})`
 * → `GET https://backservice.offerxiansheng.com/api/backend-service/enum/education-enum`
 * 实测原样（**注意不是从 0 递增的**：6=初中及以下、7=高中、8=中专/中技）：
 * `0 不限 / 6 初中及以下 / 7 高中 / 8 中专中技 / 1 大专 / 2 本科 / 3 硕士 / 4 博士`。
 *
 * ⚠️ 这里的 `0` 与列表记录里的 `educationName="不限学历"` 是同一件事。
 */
export const WAIQI_EDUCATION_OPTIONS = [
    { value: '0', label: '不限' },
    { value: '1', label: '大专' },
    { value: '2', label: '本科' },
    { value: '3', label: '硕士' },
    { value: '4', label: '博士' },
    { value: '6', label: '初中及以下' },
    { value: '7', label: '高中' },
    { value: '8', label: '中专/中技' },
];
/**
 * 城市名 → 平台城市 id。
 *
 * **必须人工维护**（§4.2.2：字段→平台编码的映射无法自动推导）。
 * 取值方式（已逐个实测）：
 * ```
 * GET {WAIQI_API_BASE}/city/search?name=深圳
 * → {"code":1000,"data":[{"id":248,"name":"深圳市","type":2,"parentId":20,...}]}
 * ```
 * 城市 id 是平台自增的城市表主键（北京=35、上海=37、深圳=248、苏州=124……），
 * **不能**按行政区划码猜 —— 猜错的表现是"搜出来 0 条"，静默无提示。
 *
 * 表里没有的城市 → `buildSearchUrl` 返回 `null`、`gotoSearch` 明确报错，
 * 而不是把城市名原样塞进去让服务端默默忽略（那会变成"抓了全国还以为抓了深圳"）。
 * 补城市请走 DB 覆盖：`setting(scope='platform', scope_ref='waiqi', key='adapter-config')`
 * 的 `cityCodes`，值直接从上面那条 `city/search` 抄。
 */
export const WAIQI_CITY_CODES = {
    北京: 35,
    上海: 37,
    广州: 247,
    深圳: 248,
    天津: 36,
    重庆: 38,
    南京: 120,
    苏州: 124,
    杭州: 133,
    成都: 282,
    青岛: 182,
    郑州: 198,
    武汉: 216,
    长沙: 233,
    西安: 354,
    无锡: 121,
    宁波: 134,
    厦门: 162,
    佛山: 252,
    东莞: 263,
    合肥: 144,
    济南: 181,
    大连: 85,
    沈阳: 84,
    福州: 161,
    南昌: 170,
    昆明: 330,
    贵阳: 303,
    南宁: 364,
    哈尔滨: 107,
    长春: 98,
    石家庄: 39,
    太原: 50,
    兰州: 268,
    珠海: 249,
    中山: 264,
    惠州: 257,
    温州: 135,
    嘉兴: 136,
    南通: 125,
    常州: 123,
    徐州: 122,
    烟台: 186,
    潍坊: 187,
    泉州: 165,
    香港: 425,
    澳门: 424,
    台北: 61,
};
/**
 * 职能取值域（`posIds`）—— 实测 **seed**，来自真实列表响应，非全量。
 *
 * 前端的筛选条件（`chunk-ce4890b6`）里职能是两级树：`businessCategory（行业）→ posInfos（职能）`，
 * 完整表由接口 `getPlatformTypes` 返回；这里只内置**抓取夹具里真实出现、且常见度高的 16 个职能**
 * （含 IT技术 / 医药 / 销售 / 运营 等高频类），走与城市完全相同的「人工维护 + DB 覆盖」逻辑（§7）。
 *
 * 需要扩充/补全时，请走 DB：`setting(scope='platform', scope_ref='waiqi', key='adapter-config')`
 * 的 `posInfoList`，值从 `GET {apiBase}/platform-type` 这类接口抄（见 `docs/PLATFORM-WAIQI.md` §6）。
 */
export const WAIQI_POS_INFO_SEED = [
    { id: 43, name: '商务渠道' },
    { id: 67, name: '税务/审计/会计/咨询' },
    { id: 81, name: '私域运营' },
    { id: 97, name: '销售顾问' },
    { id: 98, name: '销售经理' },
    { id: 115, name: '零售管理' },
    { id: 137, name: '项目助理' },
    { id: 176, name: '仓储管理' },
    { id: 178, name: '工程管理' },
    { id: 203, name: '药品生产' },
    { id: 239, name: '热设计工程师' },
    { id: 323, name: '算法工程师' },
    { id: 408, name: '前台' },
    { id: 424, name: '会计经理/主管' },
    { id: 426, name: '总账会计' },
    { id: 585, name: '售前技术支持' },
];
/**
 * 行业取值域（`businessCategoryIdList`）—— **2026-09-21 探针实测全量**。
 *
 * ⚠️ 这一份是修过的：原来的 13 项 seed 抄的是**职能**（`position/list`：8=产品、11=运营、
 * 33=IT技术…），而平台的行业字典是另一个 id 空间（33=不限、26=IT/互联网/游戏、
 * 27=金融业…）。两套码混用之后，"选行业"发出去的是职能码 —— 平台多半按未知码忽略，
 * 用户看到的就是"选了行业，结果还是全量"。
 *
 * 实测来源：`GET /api/backend-service/business-dict/list`（30 项，本表去掉"不限"：
 * 不限由**不填**表达，与界面上的"不限"是同一件事）。
 * 探针：`node scripts/run-ts.mjs test/tools/probe-filters.ts --platforms=waiqi`。
 */
export const WAIQI_BUSINESS_CATEGORY_SEED = [
    { id: 27, name: '金融业' },
    { id: 26, name: 'IT/互联网/游戏' },
    { id: 41, name: '人工智能' },
    { id: 25, name: '房地产业/建筑业' },
    { id: 29, name: '咨询' },
    { id: 34, name: '法律' },
    { id: 35, name: '财务/审计/税务' },
    { id: 31, name: '人力资源服务' },
    { id: 30, name: '智能硬件' },
    { id: 24, name: '商务服务业' },
    { id: 23, name: '生活服务业' },
    { id: 22, name: '文化/传媒/广告/体育' },
    { id: 21, name: '快速消费品' },
    { id: 20, name: '耐用消费品' },
    { id: 19, name: '机械/制造业' },
    { id: 42, name: '数字工业' },
    { id: 18, name: '汽车制造/维修/零配件' },
    { id: 17, name: '通信/电子/半导体' },
    { id: 16, name: '贸易/批发/零售' },
    { id: 15, name: '医疗/医药/生物' },
    { id: 14, name: '教育/培训/科研' },
    { id: 38, name: '新能源' },
    { id: 13, name: '能源/化工/环保' },
    { id: 12, name: '交通/物流/仓储' },
    { id: 39, name: '自动驾驶出行服务' },
    { id: 36, name: '检测/认证' },
    { id: 37, name: '专利/商标/知识产权' },
    { id: 11, name: '农林牧渔' },
    { id: 10, name: '政府/机构/组织' },
];
/**
 * 公司类型取值域（请求体的 `companyTypeList`，**数组、可多选**）—— 2026-09-21 探针实测全量。
 *
 * 实测来源：`GET /api/position-service/company-tag/fixed-group-list`（45 项，全部 groupId=4）。
 * 站点初始请求里 `companyTypeList: []`（空数组 = 不筛），所以我们之前**完全没声明**它：
 * 界面上没有这个条件，用户也就没法按"美企/德企/中德合资"筛。
 */
export const WAIQI_COMPANY_TYPE_SEED = [
    { id: 28, name: '美企' },
    { id: 29, name: '日企' },
    { id: 30, name: '韩企' },
    { id: 31, name: '德企' },
    { id: 34, name: '英企' },
    { id: 35, name: '俄企' },
    { id: 77, name: '澳企' },
    { id: 36, name: '法企' },
    { id: 33, name: '新加坡外企' },
    { id: 80, name: '泰国外企' },
    { id: 84, name: '印尼外企' },
    { id: 100, name: '菲律宾外企' },
    { id: 83, name: '马来西亚外企' },
    { id: 86, name: '印度外企' },
    { id: 74, name: '意大利外企' },
    { id: 102, name: '加拿大外企' },
    { id: 85, name: '西班牙外企' },
    { id: 69, name: '比利时外企' },
    { id: 40, name: '荷兰外企' },
    { id: 75, name: '芬兰外企' },
    { id: 32, name: '瑞士外企' },
    { id: 42, name: '瑞典外企' },
    { id: 81, name: '挪威外企' },
    { id: 46, name: '丹麦外企' },
    { id: 87, name: '新西兰外企' },
    { id: 41, name: '爱尔兰外企' },
    { id: 78, name: '奥地利外企' },
    { id: 90, name: '萨摩亚外企' },
    { id: 93, name: '乌拉圭外企' },
    { id: 92, name: '沙特外企' },
    { id: 91, name: '以色列外企' },
    { id: 39, name: '中国香港' },
    { id: 96, name: '中国澳门' },
    { id: 103, name: '中国台湾' },
    { id: 89, name: '港澳台合资' },
    { id: 97, name: '中美合资' },
    { id: 47, name: '美中合资' },
    { id: 95, name: '中英合资' },
    { id: 98, name: '中意合资' },
    { id: 123, name: '中国瑞士合资' },
    { id: 94, name: '英美合资' },
    { id: 88, name: '英荷合资' },
    { id: 99, name: '英澳合资' },
    { id: 101, name: '德日合资' },
    { id: 628, name: '中德合资' },
];
/** 详情页 URL 模板。`{jobId}` 与 `{posType}` 会被替换。 */
export const WAIQI_DETAIL_URL_TEMPLATE = `${WAIQI_WEB_BASE}/position/detail?id={jobId}&posType={posType}`;
export const DEFAULT_WAIQI_CONFIG = {
    webBase: WAIQI_WEB_BASE,
    apiBase: WAIQI_API_BASE,
    listPath: WAIQI_LIST_PATH,
    detailPath: WAIQI_DETAIL_PATH,
    detailApiEnabled: true,
    detailUrlTemplate: WAIQI_DETAIL_URL_TEMPLATE,
    defaultPosType: '1',
    cityCodes: WAIQI_CITY_CODES,
    posInfoList: WAIQI_POS_INFO_SEED,
    businessCategoryList: WAIQI_BUSINESS_CATEGORY_SEED,
    companyTypeList: WAIQI_COMPANY_TYPE_SEED,
    fields: {
        id: 'id',
        title: 'name',
        titleEn: 'nameEn',
        company: 'companyName',
        salaryMin: 'salaryMin',
        salaryMax: 'salaryMax',
        salaryMonths: 'coefficient',
        negotiable: 'negotiable',
        city: 'cityNameList',
        district: 'districtName',
        posCategory: 'posCategoryName',
        address: 'address',
        exp: 'workExpName',
        edu: 'educationName',
        tags: 'tagNameList',
        attribute: 'attribute',
        publishedAt: 'createTime',
        industry: 'businessCategoryNameList',
        companySize: 'scaleName',
        companyNature: 'companyType',
        foreignTag: 'foreignCompanyTag',
        logoUrl: 'logoUrl',
        source: 'source',
        positionType: 'posType',
        outsideUrl: 'outsideUrl',
        informationSource: 'informationSource',
        applyKind: 'sendType',
    },
    detailFields: {
        id: 'id',
        title: 'name',
        titleEn: 'nameEn',
        company: 'companyName',
        salaryMin: 'salaryMin',
        salaryMax: 'salaryMax',
        salaryMonths: 'coefficient',
        negotiable: 'negotiable',
        // ⚠️ 详情响应里是小写 l（实测），与列表的 cityNameList 不同 —— 两份字段表不能共用。
        city: 'cityNamelist',
        district: 'districtName',
        address: 'address',
        exp: 'workExpName',
        edu: 'educationName',
        industry: 'businessCategoryNameList',
        companySize: 'scaleName',
        companyNature: 'companyType',
        welfare: 'welfareList',
        attribute: 'attribute',
        jdText: 'description',
        jdTranslate: 'translateDescription',
        publishedAt: 'createTime',
        outsideUrl: 'outsideUrl',
        informationSource: 'informationSource',
        source: 'source',
        positionType: 'posType',
    },
    selectors: {
        // 实测渲染出来的卡片容器（`.list-wrap` 下的岗位卡）。
        // 它只用来等页面活过来 —— 数据来自接口，不来自这些节点。
        card: '.list-wrap .position-item',
        nextPage: '.el-pagination .btn-next:not([disabled])',
    },
};
/**
 * 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。
 *
 * 合并**边界**上做校验（zhipin 同款纪律）：DB 覆盖是人的手笔，写坏的形态必须在这里拦下，
 * 不能让它流进页面上下文 —— 那里的失败形态是"整页解析挂掉"或"静默筛不出结果"，
 * 两种都不报警。
 */
export function mergeWaiqiConfig(override) {
    if (override === null || typeof override !== 'object')
        return DEFAULT_WAIQI_CONFIG;
    const patch = override;
    const text = (value, fallback) => typeof value === 'string' && value !== '' ? value : fallback;
    /**
     * 城市 / 职能 / 行业的 seed 表：只留 `{id: 正数, name: 非空串}` 的条目。
     *
     * 为什么要逐条校验：这三张表直接变成**筛选维度的取值域**。一条脏数据
     * （`id:'x'` / `name:null`）会让界面渲染出 `undefined` 选项；城市码非数值
     * 则会把 `"abc"` 拼进 `cityIds` —— 这个平台对错误参数的表现是**静默忽略**，
     * 用户看到的就是"选了城市，抓回来的是全国"。
     */
    const seedList = (value, fallback) => {
        if (!Array.isArray(value))
            return fallback;
        const out = [];
        for (const item of value) {
            if (item === null || typeof item !== 'object')
                continue;
            const candidate = item;
            const id = typeof candidate.id === 'number' ? candidate.id : Number(candidate.id);
            if (!Number.isFinite(id) || id <= 0)
                continue;
            if (typeof candidate.name !== 'string' || candidate.name.trim() === '')
                continue;
            out.push({ id, name: candidate.name });
        }
        return out;
    };
    /** 城市码：值归一成正数；脏条目直接丢弃（**不覆盖**默认表里的同名城市）。 */
    const cityCodes = (value) => {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            return { ...DEFAULT_WAIQI_CONFIG.cityCodes };
        }
        const merged = { ...DEFAULT_WAIQI_CONFIG.cityCodes };
        for (const [name, raw] of Object.entries(value)) {
            if (name.trim() === '')
                continue;
            const code = typeof raw === 'number' ? raw : Number(raw);
            if (!Number.isFinite(code) || code <= 0)
                continue;
            merged[name] = code;
        }
        return merged;
    };
    return {
        webBase: text(patch.webBase, DEFAULT_WAIQI_CONFIG.webBase),
        apiBase: text(patch.apiBase, DEFAULT_WAIQI_CONFIG.apiBase),
        listPath: text(patch.listPath, DEFAULT_WAIQI_CONFIG.listPath),
        detailPath: text(patch.detailPath, DEFAULT_WAIQI_CONFIG.detailPath),
        detailApiEnabled: typeof patch.detailApiEnabled === 'boolean'
            ? patch.detailApiEnabled
            : DEFAULT_WAIQI_CONFIG.detailApiEnabled,
        detailUrlTemplate: text(patch.detailUrlTemplate, DEFAULT_WAIQI_CONFIG.detailUrlTemplate),
        defaultPosType: text(patch.defaultPosType, DEFAULT_WAIQI_CONFIG.defaultPosType),
        cityCodes: cityCodes(patch.cityCodes),
        posInfoList: seedList(patch.posInfoList, DEFAULT_WAIQI_CONFIG.posInfoList),
        businessCategoryList: seedList(patch.businessCategoryList, DEFAULT_WAIQI_CONFIG.businessCategoryList),
        companyTypeList: seedList(patch.companyTypeList, DEFAULT_WAIQI_CONFIG.companyTypeList),
        fields: { ...DEFAULT_WAIQI_CONFIG.fields, ...(patch.fields ?? {}) },
        detailFields: { ...DEFAULT_WAIQI_CONFIG.detailFields, ...(patch.detailFields ?? {}) },
        selectors: { ...DEFAULT_WAIQI_CONFIG.selectors, ...(patch.selectors ?? {}) },
    };
}
/**
 * **在页面上下文里**判断是否撞上风控 / 登录墙 / 空白页。
 *
 * 与 51job / 智联不同：这里列表不是 DOM 渲染的，所以
 * "卡片数"只能当佐证，**接口返回**才是主判据。
 *
 * 已知的接口侧信号：
 *   * `code=1022` = 需要登录（收藏/订阅类接口会返回；列表接口匿名可用）；
 *   * `code=429` = 平台的频控墙（`访问行为异常，请稍后再试`）—— 匿名接口高频访问时实测会返回，
 *     判成 `rate-limited`，让主链**停手退避**，不硬重试（C12 / P5）；
 *   * `code=1010` = 参数校验失败（例如 `size>50`）—— 那是我们自己的 bug，不是墙，
 *     所以**不**报成 block，让它以 PARSE_FAILED 暴露出来；
 *   * `code=999` = 服务端数据异常（例如 `type=0`）。
 *
 * 命中即停、交还人工，**不硬重试**（C12 / P5）。
 */
export const WAIQI_BLOCK_SIGNALS = {
    captchaSelectors: ['.waf-nc-title', 'script[name^="aliyunwaf_"]'],
    // 神仙外企的限流文案里有「系统繁忙」（通用词表里没有这一条）
    rateText: ['系统繁忙'],
    // 阈值 80 比通用的 120 更严：它的"搜到 0 条"结果页也有筛选器文案
    blankTextLength: 80,
};
//# sourceMappingURL=config.js.map