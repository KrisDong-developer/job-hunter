import { DomainError } from '../util/errors.js';
import { DEFAULT_PROVIDER_ID, enrichmentProviderOf } from './registry.js';
import { matchCandidates } from './matcher.js';
import { extractDetailHtml } from './providers/tianyancha/extractor.js';
/**
 * 工商补全编排（enrichment 领域入口）。
 *
 * 与采集（scheduler/plan）完全解耦：这里是"按需一次性查询"（照 `POST /crawl/run`
 * 的先例），没有方案、没有定时。浏览器与采集共享同一个 `BrowserManager`
 * （页面池天然各拿各的 tab），并发由本模块的串行锁保证 —— 同一时刻只查一家。
 *
 * 合规护栏**写死在代码里，刻意不做设置**（用户拍板）：
 *   * 每日 20 家（跨重启持久化，跨天清零）—— 个人自用、手动触发的安全区；
 *   * 家与家之间至少 3 秒间隔；
 *   * 撞登录墙/人机验证就停（blocked 如实上报），绝不绕过。
 */
const DAILY_LIMIT = 20;
const MIN_INTERVAL_MS = 3_000;
const DAILY_KEY = 'enrichment-daily';
/** 串行锁：同一时刻只查一家（模块级 —— 插件单进程，进程内互斥就够）。 */
let inflight = null;
let lastRunAt = 0;
async function serialize(task) {
    const previous = inflight;
    let release = () => { };
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    inflight = gate;
    try {
        if (previous !== null)
            await previous;
        return await task();
    }
    finally {
        release();
        if (inflight === gate)
            inflight = null;
    }
}
/** 每日计数（setting 表持久化，跨天清零）。超额抛 QUOTA_EXCEEDED —— 如实拒绝。
 * 按本地日期翻篇（`toISOString` 是 UTC：北京时间 0-8 点会错误地记到"昨天"头上）。 */
function takeDailyQuota(deps, now) {
    const pad = (n) => String(n).padStart(2, '0');
    const today = `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const current = deps.settings.get(DAILY_KEY, 'global');
    const count = current?.date === today ? current.count : 0;
    if (count >= DAILY_LIMIT) {
        throw new DomainError('QUOTA_EXCEEDED', `今天的工商查询已到上限（${String(DAILY_LIMIT)} 家）。这是刻意的自我节制 —— 明天再查，或直接点来源链接去网页上看`);
    }
    deps.settings.set(DAILY_KEY, 'global', '', { date: today, count: count + 1 }, now.toISOString());
}
function nowIso() {
    return new Date().toISOString();
}
/**
 * 查一家公司的工商快照。
 *
 * @param pick 用户从候选里点选的那条（`pickUrl` 来自上一次 `pick-one` 的返回）——
 *             传了就跳过搜索直接进详情，以 `manual` 置信级入库。
 */
export async function enrichCompany(deps, companyId, pick) {
    const company = deps.companies.get(companyId);
    if (company === undefined)
        throw new DomainError('NOT_FOUND', `公司不存在：${String(companyId)}`);
    return await serialize(async () => {
        // pick（点选候选）不再扣额度 —— 搜索那一步已经为这家公司扣过了，同一家扣两次不公平
        if (pick === undefined)
            takeDailyQuota(deps, new Date());
        // 节流：距上一次查询太近就等满间隔（手动触发间隔天然大，这是兜底）
        const wait = MIN_INTERVAL_MS - (Date.now() - lastRunAt);
        if (wait > 0)
            await new Promise((resolve) => setTimeout(resolve, wait));
        lastRunAt = Date.now();
        const provider = enrichmentProviderOf(DEFAULT_PROVIDER_ID);
        if (provider === undefined)
            throw new DomainError('INTERNAL', '工商数据源未注册');
        await deps.browser.ensure();
        const page = await deps.browser.page();
        try {
            deps.browser.touch(); // 查询进行中：别让空闲自关把浏览器收了
            // ① 搜索（或点选直达详情）
            let detailPath;
            let confidence;
            let candidates = [];
            if (pick !== undefined && pick.url !== '') {
                detailPath = pick.url;
                confidence = 'manual';
            }
            else {
                const outcome = await provider.search(company.name, page);
                if (outcome.kind === 'blocked') {
                    throw new DomainError('BLOCKED', outcome.reason === 'login-wall'
                        ? '天眼查要求登录才能继续（今天查得多了？）。已停止 —— 稍后再试，或点「来源」去网页上看'
                        : outcome.reason === 'captcha'
                            ? '天眼查弹出人机验证，已停止（不绕过）。稍后再试'
                            : '天眼查页面等待超时，稍后再试');
                }
                if (outcome.kind === 'empty') {
                    // 工商库查无此主体：值得看见的留痕，不是错误（写法差异很常见，不加风险分）
                    deps.companies.upsertEnrichment({
                        companyId,
                        provider: provider.id,
                        matchedName: null,
                        creditCode: null,
                        confidence: 'unmatched',
                        regStatus: null, estDate: null, regCapital: null, orgType: null,
                        legalPerson: null, industry: null, staffNum: null,
                        suitCount: null, investCount: null, licenseCount: null,
                        tags: [], sourceUrl: null, fetchedAt: nowIso(),
                    }, nowIso());
                    deps.onEnriched?.(companyId);
                    return { kind: 'unmatched' };
                }
                candidates = outcome.items;
                const verdict = matchCandidates(company.nameNorm, candidates);
                if (verdict.kind === 'pick-one')
                    return { kind: 'pick-one', candidates: verdict.candidates };
                if (verdict.kind !== 'exact') {
                    // 候选非空时 matcher 不会给 unmatched —— 到这里说明空列表漏了 empty 分支，如实兜底
                    return { kind: 'unmatched' };
                }
                detailPath = verdict.pick.url;
                confidence = 'exact';
            }
            // ② 进详情页提取
            const detail = await provider.fetchDetail(detailPath, page);
            if ('kind' in detail) {
                // 联合里带 kind 的只有 blocked 一种成员
                throw new DomainError('BLOCKED', `进详情页被拦（${detail.reason}），稍后再试`);
            }
            const { record, hits } = extractDetailHtml(detail.html, detail.url);
            // 字段健康：一条查询命中 0 个字段 = 页面结构变了，如实报错而不是存一份全空快照
            if (hits.length === 0) {
                throw new DomainError('ADAPTER_DEGRADED', '页面解析失败（0 个字段命中）—— 天眼查页面结构可能已更新');
            }
            // ③ 入库（快照整体覆盖）
            const enrichment = deps.companies.upsertEnrichment({
                companyId,
                provider: provider.id,
                // matchedName 只信 NEXT_DATA，拿不到就用本库公司名（展示用，不冒充工商注册名）
                matchedName: record.matchedName ?? company.name,
                creditCode: record.creditCode,
                confidence,
                regStatus: record.regStatus,
                estDate: record.estDate,
                regCapital: record.regCapital,
                orgType: record.orgType,
                legalPerson: record.legalPerson,
                industry: record.industry,
                staffNum: record.staffNum,
                suitCount: record.suitCount,
                investCount: record.investCount,
                licenseCount: record.licenseCount,
                tags: record.tags,
                sourceUrl: record.sourceUrl,
                fetchedAt: nowIso(),
            }, nowIso());
            deps.onEnriched?.(companyId);
            return { kind: 'done', enrichment };
        }
        finally {
            await deps.browser.release(page);
        }
    });
}
//# sourceMappingURL=index.js.map