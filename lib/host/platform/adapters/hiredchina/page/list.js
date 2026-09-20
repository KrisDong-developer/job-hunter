/**
 * **在页面上下文里**解析列表页（RSC 流 → `initialData.list` → `RawJob[]`）。
 * ⚠️ 必须完全自包含（序列化送浏览器执行）；任何模块作用域符号都会 ReferenceError。
 *
 * @param arg `anchors` = RSC 流锚点（dataKey/listKey/detailPathPattern，可 DB 覆盖）；
 *   `lang` = 语言路径段（`en`/`zh`，详情 URL 的 `/<lang>/job/<uuid>` 前缀）。
 */
export function extractJobsFromPayloadInPage(arg) {
    const out = [];
    const clean = (value) => value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim();
    const str = (value) => (typeof value === 'string' ? value : '');
    // ── i18n key → 可读文本（全部自包含；规则见文件头）──────────────────────
    /** key 去掉 `support.<域>.` 前缀后按构词还原：`.-.` → ' - '，`.` → ' '，词首大写，k/RMB 特判。 */
    const pretty = (key) => {
        if (key === '')
            return '';
        const tail = key
            .split('.')
            .slice(2)
            .join(' ')
            .replace(/\s+-\s+/g, ' - ');
        if (tail === '')
            return '';
        return tail
            .split(' ')
            .map((word) => {
            if (word === 'rmb')
                return 'RMB';
            if (/^\d+k$/i.test(word))
                return word.slice(0, -1) + 'K';
            return word === '' ? word : word.charAt(0).toUpperCase() + word.slice(1);
        })
            .join(' ');
    };
    /**
     * 薪资 key 还原。`keep.secret` 是平台的"薪资保密"态 —— 还原成 "Negotiable"
     * （面议，与平台 UI 文案一致，也是 validate.ts 认可的合法非空值）。
     */
    const salaryText = (key) => {
        if (key === '')
            return '';
        if (key.endsWith('keep.secret'))
            return 'Negotiable';
        return pretty(key);
    };
    /** 雇佣类型 key（`support.employment.full-time`）→ 中文归一（与站点 en/zh 文案双兼容）。 */
    const employmentNorm = (key) => {
        const v = key.toLowerCase();
        if (v.includes('full-time') || v.includes('fulltime'))
            return '全职';
        if (v.includes('part-time') || v.includes('parttime'))
            return '兼职';
        return '';
    };
    // ── 第 1 步：扫全部 <script>，把 __next_f 的分片拼成完整 RSC 流 ──────────
    let flight = '';
    try {
        const pushRe = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]/g;
        for (const script of Array.from(document.querySelectorAll('script'))) {
            const text = script.textContent ?? '';
            if (text.indexOf('self.__next_f.push') === -1)
                continue;
            let match;
            while ((match = pushRe.exec(text)) !== null) {
                const literal = match[1] ?? '';
                try {
                    flight += JSON.parse(literal);
                }
                catch {
                    /* 单个坏分片跳过，不吃掉整条流 */
                }
            }
        }
    }
    catch {
        return out;
    }
    if (flight === '')
        return out;
    // ── 第 2 步：定位 dataKey，括号配对切出 JSON 对象（跳过字符串字面量）─────
    const keyAt = flight.indexOf(`"${arg.anchors.dataKey}":`);
    if (keyAt === -1)
        return out;
    const braceAt = flight.indexOf('{', keyAt);
    if (braceAt === -1)
        return out;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let endAt = -1;
    for (let i = braceAt; i < flight.length; i += 1) {
        const ch = flight[i];
        if (inString) {
            if (escaped)
                escaped = false;
            else if (ch === '\\')
                escaped = true;
            else if (ch === '"')
                inString = false;
            continue;
        }
        if (ch === '"')
            inString = true;
        else if (ch === '{' || ch === '[')
            depth += 1;
        else if (ch === '}' || ch === ']') {
            depth -= 1;
            if (depth === 0) {
                endAt = i + 1;
                break;
            }
        }
    }
    if (endAt === -1)
        return out;
    let data;
    try {
        data = JSON.parse(flight.slice(braceAt, endAt));
    }
    catch {
        return out;
    }
    const record = (data ?? {});
    const listRaw = record[arg.anchors.listKey];
    if (!Array.isArray(listRaw))
        return out;
    // ── 第 3 步：list → RawJob ─────────────────────────────────────────────
    for (const item of listRaw) {
        const job = (item ?? {});
        const line = str(job['line']);
        const title = clean(job['name']);
        if (line === '' || title === '')
            continue;
        const companyRecord = (job['company'] ?? {});
        const company = clean(companyRecord['name']);
        const salaryRaw = salaryText(str(job['salaryKey']));
        const expReq = pretty(str(job['workingYearsKey']));
        // 地点：location/country 是 i18n key，overseasArea 是中文地名（兜底）
        const city = pretty(str(job['location'])) || pretty(str(job['country'])) || clean(job['overseasArea']);
        const employment = employmentNorm(str(job['employmentKey']));
        // isOnline 实测只有 0/1（现场/远程）；"混合"没有证据，不编
        const workMode = job['isOnline'] === 1 ? '远程' : job['isOnline'] === 0 ? '现场' : '';
        const tags = [];
        if (employment !== '')
            tags.push(employment);
        if (workMode !== '')
            tags.push(workMode);
        const notes = [];
        if (salaryRaw === '')
            notes.push('薪资 key 未锚定，待校准');
        if (company === '')
            notes.push('公司未锚定，待校准');
        const path = `/${arg.lang}${arg.anchors.detailPathPattern.replace('{id}', line)}`;
        let sourceUrl = path;
        try {
            sourceUrl = new URL(path, location.origin).href;
        }
        catch {
            /* 原样给，字段断言会兜 */
        }
        out.push({
            platformJobId: line,
            title,
            salaryRaw,
            company,
            sourceUrl,
            ...(city === '' ? {} : { city }),
            ...(expReq === '' ? {} : { expReq }),
            // payload 给的是绝对 ISO 时间戳（DOM 时代只能拿到 "2d ago" 这种相对文案）
            ...(str(job['refreshAt']) === '' ? {} : { publishedAt: str(job['refreshAt']) }),
            tags,
            ...(notes.length === 0 ? {} : { notes }),
        });
    }
    return out;
}
//# sourceMappingURL=list.js.map