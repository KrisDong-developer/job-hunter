import { strictCompanyName } from '../util/company-name.js';
export function matchCandidates(companyName, candidates) {
    if (candidates.length === 0)
        return { kind: 'unmatched' };
    const key = strictCompanyName(companyName);
    if (key === '')
        return { kind: 'pick-one', candidates };
    const exact = candidates.filter((item) => strictCompanyName(item.name) === key);
    if (exact.length === 1)
        return { kind: 'exact', pick: exact[0] ?? candidates[0] };
    // 多个 exact = 全国同名主体；没有 exact = 名称写法对不上 —— 都轮到人来点。
    return { kind: 'pick-one', candidates };
}
//# sourceMappingURL=matcher.js.map