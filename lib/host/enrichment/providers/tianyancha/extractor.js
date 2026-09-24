/**
 * 天眼查公司详情页解析器（纯函数，输入 HTML 字符串，离线可测）。
 *
 * 两级解析，抗页面改版：
 *   1. `__NEXT_DATA__`（Next.js 脱水状态，已确认存在）—— 字段全、结构稳；
 *   2. DOM 文本降级 —— 实测页面就是 `注册资本：1,026.8万人民币` 的 label:value
 *      形态（2026-09-24 实测 /company/2346105960），剥标签后按正则取。
 *
 * 诚实原则贯穿始终：**页面上没有的读数就是 `null`**，绝不猜。免登录档拿不到
 * 的（电话打码、诉讼案由明细等）不在本模块的取数清单里 —— 界面对这些位置
 * 显示"未采集"，而不是显示一个空值假装查过了。
 */
/** 已知平台标签词表（命中即收集；只在页首区域检测，避免正文提及造成误报）。 */
const KNOWN_TAGS = [
    '高新技术企业', '专精特新', '科技型中小企业', '小微企业', '瞪羚企业', '独角兽',
    '上市公司', '新三板', '曾用名', '司法案件', '国有企业', '央企', '融资',
];
/** 经营状态词表（出现在标题区才算，全文匹配会误伤"历史状态"文本）。 */
const REG_STATUSES = ['存续', '在业', '注销', '吊销', '迁出', '清算', '停业', '迁入'];
/** HTML → 纯文本（去 script/style、剥标签、解实体、压空白）。 */
function htmlToText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}
/** 正则第一条捕获组（带分组编号，兼容模式里含其它分组的情况）。 */
function firstMatch(text, pattern) {
    const found = text.match(pattern);
    if (found === null || found[1] === undefined)
        return null;
    const value = found[1].trim();
    return value === '' ? null : value;
}
/** 毫秒时间戳 → `YYYY-MM-DD`（天眼查 API 系字段 estiblishTime 的形态）。 */
function msToDate(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
        return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
/**
 * 深搜 NEXT_DATA 里的目标键（结构随页面版本漂移，只认键名不认路径）。
 * 取值器按候选顺序第一个非空命中。
 */
function deepFind(node, key, depth = 0) {
    if (depth > 12 || node === null || typeof node !== 'object')
        return undefined;
    if (Array.isArray(node)) {
        for (const item of node) {
            const found = deepFind(item, key, depth + 1);
            if (found !== undefined)
                return found;
        }
        return undefined;
    }
    const record = node;
    for (const [k, v] of Object.entries(record)) {
        if (k === key && v !== null && v !== '' && v !== undefined)
            return v;
        const found = deepFind(v, key, depth + 1);
        if (found !== undefined)
            return found;
    }
    return undefined;
}
/** NEXT_DATA 路径：能取多少取多少（键名对齐天眼查开放 API 的字段命名）。 */
function extractFromNextData(html) {
    const script = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (script === null)
        return {};
    let data;
    try {
        data = JSON.parse(script[1] ?? '');
    }
    catch {
        return {};
    }
    const text = (key) => {
        const value = deepFind(data, key);
        return typeof value === 'string' && value !== '' ? value : null;
    };
    return {
        matchedName: text('name') ?? undefined,
        creditCode: text('creditCode'),
        regStatus: text('regStatus'),
        estDate: msToDate(deepFind(data, 'estiblishTime')) ?? text('estiblishTime'),
        regCapital: text('regCapital'),
        orgType: text('companyOrgType'),
        legalPerson: text('legalPersonName'),
        industry: text('industry'),
        staffNum: text('staffNumRange'),
    };
}
/** DOM 文本路径：label:value 正则（实测形态）。 */
function extractFromText(text, sourceUrl) {
    // 标题区 = 前 ~600 字符（公司名 + 状态徽章 + 标签都在这）；全文匹配会误伤。
    const head = text.slice(0, 600);
    return {
        matchedName: undefined,
        creditCode: firstMatch(text, /统一社会信用代码[：:]\s*([0-9A-Z]{18})/),
        regStatus: REG_STATUSES.find((status) => head.includes(` ${status} `) || head.includes(`${status} `)) ?? null,
        estDate: firstMatch(text, /成立日期[：:]\s*(\d{4}-\d{2}-\d{2})/),
        regCapital: firstMatch(text, /注册资本[：:]\s*([\d,.]+[^\s，。;；]*)/),
        orgType: firstMatch(text, /企业类型[：:]\s*([^\s]{2,30})/),
        legalPerson: firstMatch(text, /法定代表人\s*[：:]\s*([\u4e00-\u9fa5A-Za-z·]{2,15})/),
        industry: firstMatch(text, /国标行业[：:]\s*([^\s]{2,20})/),
        staffNum: firstMatch(text, /员工人数[：:]\s*([^\s]{1,15})/),
        suitCount: countOf(text, /开庭公告\s*(\d+)\s*条/),
        investCount: countOf(text, /对外投资了\s*(\d+)\s*家/),
        licenseCount: countOf(text, /行政许可\s*(\d+)\s*个/),
        tags: KNOWN_TAGS.filter((tag) => head.includes(tag)),
    };
}
function countOf(text, pattern) {
    const found = text.match(pattern);
    if (found === null || found[1] === undefined)
        return null;
    const value = Number(found[1]);
    return Number.isFinite(value) ? value : null;
}
/**
 * 解析天眼查公司详情页 HTML。两级来源合并：NEXT_DATA 先取，DOM 补缺。
 * `matchedName` 两级都拿不到时回退用 URL 之外的文本首段 —— 拿不到就给空串
 * （入库前的 matcher/调用方会再校验，不在此编造）。
 */
export function extractDetailHtml(html, sourceUrl) {
    const fromJson = extractFromNextData(html);
    const text = htmlToText(html);
    const fromDom = extractFromText(text, sourceUrl);
    const record = {
        matchedName: fromJson.matchedName ?? fromDom.matchedName ?? firstMatch(text, /^(.{4,40}?(?:公司|厂|院|所|中心|集团))/) ?? '',
        creditCode: fromJson.creditCode ?? fromDom.creditCode ?? null,
        regStatus: fromJson.regStatus ?? fromDom.regStatus ?? null,
        estDate: fromJson.estDate ?? fromDom.estDate ?? null,
        regCapital: fromJson.regCapital ?? fromDom.regCapital ?? null,
        orgType: fromJson.orgType ?? fromDom.orgType ?? null,
        legalPerson: fromJson.legalPerson ?? fromDom.legalPerson ?? null,
        industry: fromJson.industry ?? fromDom.industry ?? null,
        staffNum: fromJson.staffNum ?? fromDom.staffNum ?? null,
        suitCount: fromDom.suitCount ?? null,
        investCount: fromDom.investCount ?? null,
        licenseCount: fromDom.licenseCount ?? null,
        tags: fromDom.tags ?? [],
        sourceUrl,
    };
    const hits = Object.entries(record)
        .filter(([key, value]) => key !== 'sourceUrl' && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0))
        .map(([key]) => key);
    return { record, hits };
}
//# sourceMappingURL=extractor.js.map