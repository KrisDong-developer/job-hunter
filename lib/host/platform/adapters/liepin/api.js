/**
 * **在页面上下文里**发搜索接口请求（自包含；用页面自己的 fetch 带完整
 * Cookie/指纹/TLS，与 waiqi 适配器同一铁律：绝不回退宿主 Node 的 fetch）。
 *
 * ⚠️ 请求头**不是可选的**：少一组 `x-fscp-*` 服务端就回 `{"flag":0,"code":"-1400"}`
 * （HTTP 200！），而调用方会静默回退 DOM —— 见 `LIEPIN_API_HEADERS` 的实测表。
 * 其中三项必须在**页面里现造**（序列化进来的函数不能引用闭包）：
 *   * `x-fscp-trace-id`：每请求一个 UUID（实测服务端不校验其内容，格式对即可）；
 *   * `x-fscp-bi-stat`：`{"location": <当前页 URL>}`；
 *   * `x-fscp-fe-version`：实测是**空字符串**（但必须存在）。
 *
 * 返回解析后的 JSON；任何失败返回 null（调用方走 DOM 兜底）。
 */
export function fetchListInPage(arg) {
    const fetchImpl = globalThis.fetch;
    if (typeof fetchImpl !== 'function')
        return Promise.resolve(null);
    const uuid = (() => {
        const cryptoImpl = globalThis.crypto;
        if (typeof cryptoImpl?.randomUUID === 'function')
            return cryptoImpl.randomUUID();
        // 退化形态：**保持 UUID 的形状**（实测只验形状，不验出处），别退成别的格式。
        const hex = (length) => {
            let out = '';
            while (out.length < length)
                out += Math.floor(Math.random() * 16).toString(16);
            return out.slice(0, length);
        };
        return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
    })();
    const headers = {
        ...arg.headers,
        'x-fscp-trace-id': uuid,
        'x-fscp-bi-stat': JSON.stringify({ location: globalThis.location?.href ?? '' }),
        'x-fscp-fe-version': '',
    };
    return fetchImpl(arg.apiPath, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(arg.body),
    })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
}
/** `yyyymmddHHMMss` → ISO（接口 refreshTime 形态，夹具实测）。 */
export function refreshTimeToIso(raw) {
    if (!/^\d{14}$/.test(raw))
        return null;
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+08:00`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
/**
 * 解析搜索接口响应（Node 侧纯函数；结构来自采样：`data.data.jobCardList`
 * 或 `data.jobCardList`，兼容 get_jobs 的两种观察形态）。
 */
export function parseSearchApiResponse(payload) {
    const out = [];
    if (payload === null || typeof payload !== 'object')
        return out;
    const root = payload;
    const cards = root.data?.data?.jobCardList ?? root.data?.jobCardList;
    if (!Array.isArray(cards))
        return out;
    for (const entry of cards) {
        if (entry === null || typeof entry !== 'object')
            continue;
        const item = entry;
        const job = item.job;
        const comp = item.comp;
        if (job === undefined)
            continue;
        const jobId = job['jobId'];
        if (jobId === undefined || jobId === null || String(jobId) === '')
            continue;
        const text = (value) => (typeof value === 'string' ? value.trim() : '');
        const refreshIso = refreshTimeToIso(text(job['refreshTime']));
        const labels = job['labels'];
        const tags = Array.isArray(labels)
            ? labels.filter((label) => typeof label === 'string' && label !== '').slice(0, 6)
            : undefined;
        out.push({
            platformJobId: String(jobId),
            title: text(job['title']),
            salaryRaw: text(job['salary']),
            company: comp === undefined ? '' : text(comp['compName']),
            sourceUrl: text(job['link']),
            city: text(job['dq']),
            expReq: text(job['requireWorkYears']),
            eduReq: text(job['requireEduLevel']),
            industry: comp === undefined ? null : text(comp['compIndustry']) || null,
            companySize: comp === undefined ? null : text(comp['compScale']) || null,
            publishedAt: refreshIso,
            ...(tags === undefined || tags.length === 0 ? {} : { tags }),
        });
    }
    return out;
}
/* ── 会话列表（收件箱）通道 ─────────────────────────────────────────── */
/**
 * **在页面上下文里**发**会话列表**请求（自包含；表单体）。
 *
 * 与 `fetchListInPage` 是同一个门（2026-09-20 探针实测）：**六项静态头
 * （`LIEPIN_API_HEADERS`）+ 三项现造遥测**缺一不可 —— 只给静态头时服务端回
 * `{"flag":0,"code":"-1400"}`（HTTP 200），看上去像"接口坏了"。
 *
 * 为什么不复用 `fetchListInPage`：
 *   * 那个发的是 **JSON 体**（`content-type: application/json`），而这个接口要**表单体**；
 *   * 页面上下文函数**不能用模块级的共享工具**（会被序列化、脱离作用域），
 *     所以哪怕把两者合一，遥测构造那几行也得在函数体内再写一遍 ——
 *     合一反而会让调用方多传一个"体格式"开关，得不偿失。
 */
export function fetchContactListInPage(arg) {
    const fetchImpl = globalThis.fetch;
    if (typeof fetchImpl !== 'function')
        return Promise.resolve(null);
    const uuid = (() => {
        const cryptoImpl = globalThis.crypto;
        if (typeof cryptoImpl?.randomUUID === 'function')
            return cryptoImpl.randomUUID();
        const hex = (length) => {
            let out = '';
            while (out.length < length)
                out += Math.floor(Math.random() * 16).toString(16);
            return out.slice(0, length);
        };
        return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
    })();
    const headers = {
        ...arg.headers,
        // ⚠️ 覆盖静态头里那个 `application/json`：本接口的体是**表单**，头体错配会失败。
        'content-type': 'application/x-www-form-urlencoded',
        'x-fscp-trace-id': uuid,
        'x-fscp-bi-stat': JSON.stringify({
            location: globalThis.location?.href ?? '',
        }),
        'x-fscp-fe-version': '',
    };
    return fetchImpl(arg.apiPath, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: arg.body,
    })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
}
/**
 * 解析会话列表响应 → 会话行。
 *
 * ⚠️ **返回 `null` 表示"结构不认识"**（调用方必须抛错，不能当成 0 条）；
 * 返回 `[]` 才是**可信的 0 条**（`data.list` 真的是空数组）。这条区分是收件箱的命门
 * ——「今天没人回我」与「我读不出来」在界面上必须长得不一样。
 *
 * ⚠️ `totalCount` / `pageSize` / `hasNext` / `hasMore` **四个汇总量全都不可信**：
 * 实测 `list.length = 8` 而 `totalCount = 0`、`pageSize = 0`、`hasNext = hasMore = false`。
 * ⇒ 判空只能看 `list` 本身；翻页也只能靠"本页不满一页即停"（见 `actions.ts`）。
 */
export function contactRowsOf(payload) {
    if (payload === null || typeof payload !== 'object')
        return null;
    const root = payload;
    // `flag !== 1` = 服务端拒绝（风控 / 头不全）——不当作"没有会话"，交给调用方抛
    if (root.flag !== undefined && Number(root.flag) !== 1)
        return null;
    const list = root.data?.list;
    if (!Array.isArray(list))
        return null;
    const text = (value) => (value === undefined || value === null ? '' : String(value).trim());
    const rows = [];
    for (const entry of list) {
        if (entry === null || typeof entry !== 'object')
            continue;
        const row = entry;
        const id = text(row['id']);
        if (id === '')
            continue;
        // `lastPayload` 是**一个 JSON 字符串**：不解一层就只会拿到一段转义文本。
        let inner = row['lastPayload'];
        if (typeof inner === 'string') {
            try {
                inner = JSON.parse(inner);
            }
            catch {
                inner = null;
            }
        }
        const payloadInner = (inner ?? {});
        const messages = Array.isArray(payloadInner.bodies)
            ? payloadInner.bodies
                .map((body) => text(body?.msg))
                .filter((message) => message !== '')
            : [];
        rows.push({
            id,
            name: text(row['name']),
            company: text(row['company']),
            unReadCnt: Number.parseInt(text(row['unReadCnt']), 10) || 0,
            directionRaw: text(row['direction']),
            latestMsgTime: text(row['latestMsgTime']),
            latestMsgIsRevoke: row['latestMsgIsRevoke'] === true,
            extType: text(payloadInner.ext?.extType),
            lastMessage: messages.join(' '),
            jobId: text(payloadInner.ext?.extBody?.bizData?.jobId),
        });
    }
    return rows;
}
/**
 * 会话行 → `RawInboxMessage`。
 *
 * ## 方向怎么判（这是本适配器最容易撒谎的一格，逐条写清）
 *
 * 合同的 `direction` 是**"最后一条消息是谁发的"**。页面没有直接给这个答案，
 * 于是用**有真实样本支撑**的两条判据：
 *
 *   1. `unReadCnt > 0` ⇒ `hr`。**未读**的定义就是"对方发来、我没看" ⇒ 最后一条必然是对方发的。
 *      样本 8/8 一致（7 行对方发来的真实文案 + 1 行我发起的平台建议，后者 unread=0）。
 *   2. 否则 `extType === 200` ⇒ `me`。`200` 是平台在**我点「聊一聊」之后**替我生成的
 *      招呼语建议（`clickScheme: lptd://lp/p/autoSayHi`，文案「我们为您生成了合适的打招呼语」）
 *      —— 它是**我这一侧**的动作产物，对方一个字都没说（样本 1/1）。
 *   3. 其余情况**判不出来**（例如"我回过、对方也读过"的会话）⇒ 按 `hr` 记。
 *      口径与 `zhipin` 一致且理由相同：收件箱的用途是"有没有人回我"，
 *      **漏报（把回我的说成没回）比误报贵**。
 *
 * ⚠️ **不用平台的 `direction` 字段**：它的语义没定论（见 `LiepinContactRow.directionRaw`），
 * 拿它当判据会在反方向上撒谎。
 *
 * `at` 用真实时间戳（`latestMsgTime` 毫秒 → ISO），不像 zhipin 只能给"昨天"这类相对文本。
 * `platformJobId` 只在最后一条是带岗位卡的消息（`extType 202`）时才有 ——
 * 那时它给的是**数字 jobId**，与列表/接口的规范 id 同源（见 `LiepinConfig.jobPgRefPattern`）。
 */
export function inboxMessageOf(row) {
    const millis = Number.parseInt(row.latestMsgTime, 10);
    const at = Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString() : null;
    const direction = row.unReadCnt > 0 ? 'hr' : row.extType === '200' ? 'me' : 'hr';
    return {
        conversationId: row.id,
        hrName: row.name,
        company: row.company,
        lastMessage: row.lastMessage,
        direction,
        unread: row.unReadCnt > 0,
        at,
        ...(row.jobId === '' ? {} : { platformJobId: row.jobId }),
    };
}
//# sourceMappingURL=api.js.map