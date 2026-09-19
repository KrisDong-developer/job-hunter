import { OFFER_OPEN_STATES, OFFER_STATES } from '../../shared/contract/enums/offer.js';
import { OFFER_COMP_FIELDS, annualCashOf, formatMoney, isOfferCompEmpty, offerCompDisplay } from '../../shared/domain/offer-comp.js';
import { extractJson } from '../ai/prompts.js';
import { DomainError } from '../util/errors.js';
import { systemClock } from '../util/time.js';
/** 一天。倒计时用它换算 —— 不引第三方时间库（本仓库一贯口径）。 */
const DAY_MS = 86_400_000;
/** 对比时"关键项"：缺了它们，对比表基本得不出结论（缺失要在 facts 里点出来）。 */
const CRITICAL_KEYS = ['monthlyBase', 'monthsPerYear', 'housingFundRatio', 'probationRatio'];
export function createOfferService(deps) {
    const { store } = deps;
    const clock = deps.clock ?? systemClock;
    /**
     * 距截止还有几天（负数 = 已过期）。
     *
     * 口径是**整天数**（`trunc`，即按绝对值向下取整），两个方向都对称：
     *   * 还剩 5 天零 3 小时 → `5`（"还有 5 天"，不虚报）；
     *   * 已经过了 1 天零 3 小时 → `-1`（"已过期 1 天"）。
     *
     * 为什么不是 `floor`：`floor(-1.0001) = -2`，会把"刚过一天"报成"已过期 2 天"，
     * 对已经紧张的决策没有任何好处。为什么不是 `ceil`：`ceil(0.4) = 1` 会让今天就要答复的 offer
     * 显示成"还有 1 天"，而用户会在当晚才发现它已经到期了。
     */
    const daysLeftOf = (deadline) => {
        if (deadline === null || deadline === '')
            return null;
        const at = Date.parse(deadline);
        if (!Number.isFinite(at))
            return null;
        return Math.trunc((at - Date.parse(clock())) / DAY_MS);
    };
    /** 公司名：优先用登记时手填的，其次查公司库，再退到岗位上的公司名。 */
    const companyNameOf = (record) => {
        if (record.companyName !== '')
            return record.companyName;
        if (record.companyId !== null) {
            const company = store.company.get(record.companyId);
            if (company !== undefined)
                return company.name;
        }
        return '';
    };
    const decorate = (record) => {
        const job = record.jobId === null ? undefined : store.job.detail(record.jobId);
        const application = record.applicationId === null ? undefined : store.pipeline.getApplication(record.applicationId);
        return {
            id: record.id,
            companyId: record.companyId,
            companyName: companyNameOf(record) || (job?.companyName ?? '') || '（未填公司）',
            jobId: record.jobId,
            jobTitle: job?.title ?? null,
            applicationId: record.applicationId,
            applicationStage: application?.stage ?? null,
            role: record.role !== '' ? record.role : (job?.title ?? ''),
            comp: record.comp,
            annualCash: record.annualCash,
            deadline: record.deadline,
            daysLeft: daysLeftOf(record.deadline),
            state: record.state,
            note: record.note,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
        };
    };
    const requireOffer = (id) => {
        const record = store.offer.get(id);
        if (record === undefined) {
            throw new DomainError('NOT_FOUND', `Offer 不存在：${String(id)}`, { detail: { offerId: id } });
        }
        return record;
    };
    /**
     * 写入前的收敛与校验。
     *
     * 三件事必须在这里做完（仓储只做归一化，不做业务判断）：
     *   * **身份**：至少要能认出这是哪一家的 offer（公司名 / 公司 id / 岗位 id 三者之一）；
     *   * **关联存在**：给了 jobId/companyId 就必须真的有那一行（否则后面 decorate 全是空）；
     *   * **截止时间**：非法时间串必须报错 —— 静默丢掉一个日期，
     *     表现出来是"这份 offer 没有截止时间"，而用户以为填上了（最坏的一种错）。
     */
    const resolveInput = (input) => {
        const patch = { ...input };
        if (input.state !== undefined && !OFFER_STATES.includes(input.state)) {
            throw new DomainError('INVALID_INPUT', `不支持的 offer 状态：${String(input.state)}`, {
                hint: `合法取值：${OFFER_STATES.join(' / ')}`,
            });
        }
        if (input.deadline !== undefined && input.deadline !== null && input.deadline !== '') {
            if (!Number.isFinite(Date.parse(input.deadline))) {
                throw new DomainError('INVALID_INPUT', `截止时间不是合法时刻：${input.deadline}`, {
                    hint: '用 ISO 格式，例如 2026-10-08T23:59:00+08:00。',
                });
            }
        }
        if (input.jobId !== undefined && input.jobId !== null) {
            const job = store.job.detail(input.jobId);
            if (job === undefined) {
                throw new DomainError('NOT_FOUND', `岗位不存在：${String(input.jobId)}`, {
                    hint: 'offer 可以不挂岗位（官网/内推来的），那就把 jobId 留空、填公司名。',
                });
            }
            // 从岗位补齐公司与岗位名 —— 让用户少填两格，也保证与岗位库口径一致
            if (patch.companyId === undefined && job.companyId !== null)
                patch.companyId = job.companyId;
            if (patch.companyName === undefined && job.companyName !== null)
                patch.companyName = job.companyName;
            if (patch.role === undefined || patch.role === '')
                patch.role = job.title;
        }
        if (input.companyId !== undefined && input.companyId !== null) {
            if (store.company.get(input.companyId) === undefined) {
                throw new DomainError('NOT_FOUND', `公司不存在：${String(input.companyId)}`, {
                    hint: '公司还没入库时，用 companyName 直接填名字即可。',
                });
            }
        }
        return patch;
    };
    /** 身份判断：新建时要求至少有一项（否则这份 offer 之后谁都认不出来）。 */
    const hasIdentity = (input) => (typeof input.companyName === 'string' && input.companyName.trim() !== '') ||
        (input.companyId !== undefined && input.companyId !== null) ||
        (input.jobId !== undefined && input.jobId !== null);
    return {
        list(filter = {}) {
            return store.offer.list(filter).map(decorate);
        },
        get(id) {
            return decorate(requireOffer(id));
        },
        create(input) {
            const patch = resolveInput(input);
            if (!hasIdentity(patch)) {
                throw new DomainError('INVALID_INPUT', '至少要写清是哪一家的 offer（公司名 / 公司 / 岗位 三者之一）', {
                    hint: 'OFFER 可以来自平台之外（官网、内推、猎头），那种情况直接填公司名即可。',
                });
            }
            const record = store.offer.create(patch, clock());
            deps.logger?.info(`[offer] 已登记 offer #${String(record.id)}（${companyNameOf(record) || '未填公司'}）`);
            return decorate(record);
        },
        update(id, patch) {
            requireOffer(id);
            const resolved = resolveInput(patch);
            const updated = store.offer.update(id, resolved, clock());
            if (updated === undefined)
                throw new DomainError('NOT_FOUND', `Offer 不存在：${String(id)}`);
            return decorate(updated);
        },
        setState(id, state) {
            if (!OFFER_STATES.includes(state)) {
                throw new DomainError('INVALID_INPUT', `不支持的 offer 状态：${String(state)}`, {
                    hint: `合法取值：${OFFER_STATES.join(' / ')}`,
                });
            }
            requireOffer(id);
            const updated = store.offer.setState(id, state, clock());
            if (updated === undefined)
                throw new DomainError('NOT_FOUND', `Offer 不存在：${String(id)}`);
            return decorate(updated);
        },
        remove(id) {
            return store.offer.remove(id);
        },
        byJob(jobId) {
            return store.offer.listByJob(jobId).map(decorate);
        },
        async compare(input = {}) {
            const offers = input.offerIds === undefined || input.offerIds.length === 0
                ? store.offer.list({ openOnly: true, limit: 20 }).map(decorate)
                : input.offerIds.map((id) => decorate(requireOffer(id)));
            if (offers.length < 2) {
                throw new DomainError('INVALID_INPUT', '对比至少要两份 offer', {
                    hint: offers.length === 0
                        ? '还没有登记任何 offer。用 POST /offers 把谈下来的条件记下来（含公积金比例这类容易漏的项）。'
                        : '只登记了一份。第二份到手后再来对比，或显式传 offerIds。',
                    detail: { count: offers.length },
                });
            }
            const rows = compareRows(offers);
            const facts = compareFacts(offers);
            const ai = deps.ai;
            if (ai === undefined || input.useLlm === false) {
                return { offers, rows, facts, advice: null, via: 'rule', notes: ['未调用模型：这里是规则口径的对比结论。'] };
            }
            // 名字先算一次：对比表的每一行都要带公司名，逐格调 `shortName` 会重复算 N×M 次
            const names = offers.map((offer) => shortName(offer));
            const table = rows
                .map((row) => `${row.label}：${row.values
                .map((value, index) => `${names[index] ?? `#${String(index + 1)}`}=${value ?? '未填写'}`)
                .join(' / ')}`)
                .join('\n');
            const result = await ai.call({
                purpose: 'offer_compare',
                instruction: [
                    '下面是我手上几份 offer 的逐项对比。请给出**决策建议**，要求：',
                    '1. 先指出最关键的两三处差异（不要逐项复述整张表）；',
                    '2. 指出哪些格子是**空的**、必须去问 HR（写进合同才算数）；',
                    '3. 给一句"如果是我会先看什么"的取舍提示，但**不要替我拍板**；',
                    '4. 不许编造表里没有的数字或条款。',
                ].join('\n'),
                payload: {
                    offerCount: offers.length,
                    companies: offers.map((offer) => offer.companyName).join('、'),
                    roles: offers.map((offer) => offer.role || '（未填岗位）').join('、'),
                },
                allowFields: ['offerCount', 'companies', 'roles'],
                trusted: [{ label: 'offer-compare', text: table }],
                outputSpec: '只输出 JSON：{"advice": "建议正文（可含换行）"}。不要输出其它内容。',
                maxTokens: 1024,
                temperature: 0.3,
                ref: { kind: 'offer', ids: offers.map((offer) => offer.id) },
            }, {
                parse: (raw) => {
                    const parsed = extractJson(raw);
                    if (parsed === null || typeof parsed !== 'object')
                        return undefined;
                    const advice = parsed.advice;
                    if (typeof advice !== 'string' || advice.trim() === '')
                        return undefined;
                    return { advice: advice.trim().slice(0, 3000) };
                },
                fallback: () => ({ advice: '' }),
            });
            return {
                offers,
                rows,
                facts,
                // 降级时**不编一段建议**：如实给 null，界面与工具都改成只显示规则结论
                advice: result.via === 'llm' ? result.value.advice : null,
                via: result.via === 'llm' ? 'llm' : 'rule',
                notes: result.notes,
            };
        },
        upcoming(days) {
            const before = new Date(Date.parse(clock()) + Math.max(0, days) * DAY_MS).toISOString();
            return store.offer.listDueBefore(before).map((record) => ({
                id: record.id,
                companyName: companyNameOf(record) || '（未填公司）',
                role: record.role,
                deadline: record.deadline,
                daysLeft: daysLeftOf(record.deadline) ?? 0,
                state: record.state,
            }));
        },
        openCount() {
            return store.offer.countOpen();
        },
    };
}
/** 表格里的短名：公司名 + 岗位（太长会把一行撑爆）。 */
function shortName(offer) {
    const base = offer.companyName === '' ? `#${String(offer.id)}` : offer.companyName;
    return offer.role === '' ? base : `${base}·${offer.role}`.slice(0, 24);
}
/**
 * 逐项渲染对比表。
 *
 * 三处口径值得说明：
 *   * **`differs` 只在"至少两个非空值"时才为真** —— 一份填了一份没填是"信息缺失"，
 *     不是"有差异"，把它标成差异会让用户去找一个不存在的差别；
 *   * **`bestIndex` 只给方向明确的字段**（见 `OFFER_COMP_FIELDS.direction`）：
 *     社保基数高低各有说法，硬判"更好"等于替用户下结论；
 *   * `gaps` 是"与最优值差多少"（金额 = 元、比例 = 百分点、天/分钟 = 原单位），
 *     用来把"一年差几万"这件事直接算出来（H1 的原话）。
 */
function compareRows(offers) {
    return OFFER_COMP_FIELDS.map((spec) => {
        /**
         * `annualCash` 是**派生列**：用户没填时由 `月 base × 月数 + 年终奖 + 补贴` 推出来，
         * 存在 DTO 上而不是 `comp` 里。所以这一行要读 DTO，读 `comp` 只会永远显示"未填写"
         * —— 而"年现金总包"恰恰是这张表最该有数的一行。
         */
        const numbers = offers.map((offer) => spec.key === 'annualCash'
            ? offer.annualCash
            : typeof offer.comp[spec.key] === 'number'
                ? offer.comp[spec.key]
                : null);
        const values = offers.map((offer, index) => {
            if (spec.key !== 'annualCash')
                return offerCompDisplay(spec, offer.comp);
            const cash = numbers[index] ?? null;
            return cash === null ? null : `${formatMoney(cash)}/年`;
        });
        const present = numbers.filter((value) => value !== null);
        const distinct = new Set(present);
        const differs = present.length >= 2 && distinct.size > 1;
        let bestIndex = null;
        if (spec.direction !== 'none' && present.length >= 2 && differs) {
            // 只在**非空值**之间比（缺一格不是"比它差"，是"还不知道"）
            let best = null;
            for (let index = 0; index < numbers.length; index += 1) {
                const value = numbers[index] ?? null;
                if (value === null)
                    continue;
                const current = best === null ? null : (numbers[best] ?? null);
                if (current === null || (spec.direction === 'higher' ? value > current : value < current)) {
                    best = index;
                }
            }
            bestIndex = best;
        }
        const bestValue = bestIndex === null ? null : (numbers[bestIndex] ?? null);
        const gaps = numbers.map((value) => {
            if (value === null || bestValue === null)
                return null;
            return Math.abs(value - bestValue);
        });
        return {
            key: spec.key,
            label: spec.label,
            kind: spec.kind,
            values,
            numbers,
            differs,
            bestIndex,
            gaps,
        };
    });
}
/**
 * 规则结论（**不依赖模型**：模型关掉也必须有用）。
 *
 * 只写能确定的事：谁的总包最高、谁快到期、谁缺关键项、非现金差异。
 * 不写"建议接受 X"—— 那是用户自己的决定。
 */
function compareFacts(offers) {
    const facts = [];
    const named = offers.map((offer, index) => `${String.fromCharCode(65 + index)}（${shortName(offer)}）`);
    const cash = offers
        .map((offer, index) => ({ index, cash: offer.annualCash }))
        .filter((item) => item.cash !== null);
    if (cash.length >= 2) {
        const sorted = [...cash].sort((a, b) => b.cash - a.cash);
        const top = sorted[0];
        const bottom = sorted[sorted.length - 1];
        if (top !== undefined && bottom !== undefined) {
            const gap = top.cash - bottom.cash;
            facts.push(`年现金总包最高的是 ${named[top.index] ?? ''}：${formatMoney(top.cash)}` +
                (gap > 0
                    ? `，比最低的 ${named[bottom.index] ?? ''} 高 ${formatMoney(gap)}（一年）`
                    : '，几份持平'));
        }
    }
    else {
        facts.push('年现金总包还没法比 —— 至少填「月 base」与「年发放月数」两项才推导得出来。');
    }
    const withDeadline = offers
        .map((offer, index) => ({ index, daysLeft: offer.daysLeft, deadline: offer.deadline }))
        .filter((item) => item.daysLeft !== null);
    if (withDeadline.length > 0) {
        const soonest = [...withDeadline].sort((a, b) => a.daysLeft - b.daysLeft)[0];
        if (soonest !== undefined) {
            facts.push(soonest.daysLeft < 0
                ? `${named[soonest.index] ?? ''} 的截止时间**已经过了 ${String(Math.abs(soonest.daysLeft))} 天** —— 如果还在谈，先确认对方是否仍有效。`
                : `${named[soonest.index] ?? ''} 最早到期：还有 ${String(soonest.daysLeft)} 天（${soonest.deadline.slice(0, 10)}）。`);
        }
    }
    else {
        facts.push('没有任何一份填了截止时间 —— 而"还能拖几天"恰恰是这类决策里最先要确定的事。');
    }
    const incomplete = offers
        .map((offer, index) => {
        const missing = CRITICAL_KEYS.filter((key) => offer.comp[key] === undefined);
        return { index, missing };
    })
        .filter((item) => item.missing.length > 0);
    if (incomplete.length > 0) {
        facts.push(`关键项没填全：${incomplete
            .map((item) => `${named[item.index] ?? ''} 缺 ${item.missing.join('、')}`)
            .join('；')} —— 这些要**写进合同**才算数，去问 HR。`);
    }
    const equity = offers.filter((offer) => offer.comp.equityValue !== undefined);
    if (equity.length > 0 && equity.length < offers.length) {
        facts.push('部分 offer 有股票/期权、部分没有 —— 这部分不是现金，别直接加进总包比。');
    }
    if (offers.every((offer) => isOfferCompEmpty(offer.comp))) {
        facts.push('两份都还没填待遇明细 —— 对比表现在是空的，先把月 base 与月数填上。');
    }
    return facts;
}
//# sourceMappingURL=offers.js.map