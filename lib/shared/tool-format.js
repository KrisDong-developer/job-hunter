/**
 * 工具结果的**文本契约** —— 宿主生产、客户端 toolview 消费，两边共用这一个文件。
 *
 * 为什么要有这么一层：客户端 toolview 只能拿到工具的**文本内容块**，
 * 拿不到结构化 `value`。要做岗位卡片就只能约定一种格式 ——
 * 那就把「生产」与「解析」放进同一个模块，改一边就必然会动另一边（同 labels.ts 的思路）。
 *
 * 格式刻意选得**同时对人可读**：这些行也是模型看到的上下文（§22.5 上下文友好），
 * 所以不能写成 JSON，也不能塞整段 JD。
 */
/** 列表行：#12 高级前端工程师 · 腾讯科技 · 深圳 南山 · 25-40K · 粗筛 82 */
export const JOB_LIST_LINE = /^#(\d+)\s+(.+)$/;
/** 列表行内的字段分隔符。 */
export const LIST_FIELD_SEP = ' · ';
/** 把一条岗位渲染成卡片行（客户端会按 `LIST_FIELD_SEP` 切开）。 */
export function formatJobListLine(job) {
    const place = job.district === '' ? job.city : `${job.city} ${job.district}`;
    const fields = [
        job.title,
        job.companyName ?? '未知公司',
        place === '' ? '地点未知' : place,
        job.salaryRaw === '' ? '薪资面议' : job.salaryRaw,
        job.matchScore === null ? '未打分' : `粗筛 ${String(Math.round(job.matchScore))}`,
    ];
    const marks = job.flagTypes.length > 0 ? ` ⚠ ${job.flagTypes.length} 项标注` : '';
    return `#${String(job.id)} ${fields.join(LIST_FIELD_SEP)}${marks}`;
}
export function parseJobListLine(line) {
    const match = JOB_LIST_LINE.exec(line.trim());
    if (match === null)
        return undefined;
    const id = Number.parseInt(match[1] ?? '', 10);
    if (!Number.isFinite(id))
        return undefined;
    const rest = (match[2] ?? '').replace(/\s+⚠.*$/, '');
    const fields = rest.split(LIST_FIELD_SEP);
    return {
        id,
        title: fields[0] ?? '',
        company: fields[1] ?? '',
        city: fields[2] ?? '',
        salary: fields[3] ?? '',
        score: fields[4] ?? '',
    };
}
/** 详情卡片的键（客户端按这些键渲染成一行行）。 */
export const DETAIL_KEYS = {
    company: '公司',
    place: '地点',
    salary: '薪资',
    requirement: '要求',
    match: '粗筛匹配',
    flags: '标注',
    jd: 'JD 摘要',
    url: '链接',
};
/** 详情卡片的第一行（标题行，没有键名）。 */
export function formatJobDetailTitle(id, title, company) {
    return `#${String(id)} ${title}${company === null || company === '' ? '' : ` @ ${company}`}`;
}
/** 一行 `键：值`。 */
export function formatDetailLine(key, value) {
    return `${key}：${value}`;
}
/** 解析详情卡片的正文行；标题行返回 `null`（客户端自己渲染标题）。 */
export function parseDetailLines(text) {
    return text
        .split('\n')
        .map((raw) => raw.trim())
        .filter((raw) => raw !== '')
        .map((raw) => {
        const index = raw.indexOf('：');
        if (index <= 0)
            return null;
        const key = raw.slice(0, index);
        if (!Object.values(DETAIL_KEYS).includes(key))
            return null;
        return { key, value: raw.slice(index + 1) };
    });
}
/**
 * 把 JD 压成**摘要**再外发/展示。
 *
 * 为什么不给全文：§22.5 明确「工具返回不塞入完整 JD」。模型需要的是"这岗位要什么"，
 * 全文在界面里看即可，塞进上下文只会挤掉真正有用的东西。
 */
export const JD_SUMMARY_CHARS = 400;
export function summarizeJd(text, limit = JD_SUMMARY_CHARS) {
    if (text === null || text === '')
        return '（没有抓到 JD 正文）';
    const flat = text.replace(/\s+/g, ' ').trim();
    if (flat.length <= limit)
        return flat;
    return `${flat.slice(0, limit)}…（已截断，全文在岗位面板里）`;
}
//# sourceMappingURL=tool-format.js.map