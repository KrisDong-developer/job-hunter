import { asString, enumStr, requireData, schema, str, textResult, toolDefiner } from './kit.js';
export function analyticsTools(runtime) {
    const tool = toolDefiner(runtime);
    return [
        tool({
            name: 'job_report',
            description: '数据看板：投递漏斗、渠道/简历版本归因、薪资分位、薪资箱线图、本地基准对比、简历版本 A/B 对比。' +
                '低危，只读。样本量太小时会明确说明"别据此下结论"，不会硬给你一个百分比。',
            parameters: schema({
                what: enumStr(['funnel', 'attribution', 'salary', 'box', 'baseline', 'resume', 'all'], '要看哪一块，默认 all。box = 箱线图（P25–P75）；baseline = 与**你自己岗位库**的基准对比；' +
                    'resume = 简历版本 A/B 对比（每格带样本量，不做显著性）'),
                city: str('薪资与基准的城市范围'),
                q: str('薪资与基准的岗位关键词'),
                basis: enumStr(['monthly_min', 'annualized'], '箱线图口径：月薪下限 / 年薪折算。**必须显式** —— 两个口径算出来的中位数不一样'),
            }),
            ...textResult,
            async run(args) {
                requireData(runtime);
                const what = asString(args['what']) ?? 'all';
                const analytics = runtime.analytics();
                const lines = [];
                if (what === 'funnel' || what === 'all') {
                    const funnel = analytics.funnel();
                    lines.push('【漏斗】');
                    for (const step of funnel.steps) {
                        lines.push(`· ${step.label}：${String(step.count)}` +
                            `${step.rate === null ? '' : `（上一层转化 ${(step.rate * 100).toFixed(0)}%）`}`);
                    }
                    lines.push(`  ${funnel.note}`);
                }
                if (what === 'attribution' || what === 'all') {
                    const attribution = analytics.attribution();
                    lines.push('', '【渠道归因】');
                    if (attribution.byChannel.length === 0)
                        lines.push('· 还没有投递记录');
                    for (const row of attribution.byChannel) {
                        lines.push(`· ${row.label}：投 ${String(row.total)}｜回复 ${String(row.replied)}｜` +
                            `面试 ${String(row.interviewed)}｜Offer ${String(row.offered)}`);
                    }
                    lines.push('', '【简历版本归因】');
                    if (attribution.byResume.length === 0)
                        lines.push('· 还没有投递记录');
                    for (const row of attribution.byResume) {
                        lines.push(`· ${row.label}：投 ${String(row.total)}｜回复 ${String(row.replied)}｜面试 ${String(row.interviewed)}`);
                    }
                    lines.push(`  ${attribution.note}`);
                }
                const city = asString(args['city']);
                const keyword = asString(args['q']);
                const basisRaw = asString(args['basis']);
                const basis = basisRaw === 'annualized' ? 'annualized' : 'monthly_min';
                if (what === 'salary' || what === 'all') {
                    const band = analytics.salaryBand({
                        ...(city === undefined ? {} : { city }),
                        ...(keyword === undefined ? {} : { keyword }),
                    });
                    lines.push('', `【薪资分位 · ${band.scope}】`);
                    lines.push(band.count === 0
                        ? '· 没有带薪资下限的岗位样本'
                        : `· 样本 ${String(band.count)} 条（只看薪资下限）｜P25 ${String(band.p25)}｜` +
                            `中位 ${String(band.median)}｜P75 ${String(band.p75)}`);
                }
                if (what === 'box' || what === 'all') {
                    const chart = analytics.salaryBox({
                        ...(city === undefined ? {} : { city }),
                        ...(keyword === undefined ? {} : { keyword }),
                        basis,
                    });
                    lines.push('', `【薪资箱线图 · ${chart.box.basisLabel}】`);
                    lines.push(chart.box.count === 0
                        ? '· 没有符合该口径的岗位样本'
                        : `· 样本 ${String(chart.box.count)} 条｜最小 ${String(chart.box.min)}｜P25 ${String(chart.box.p25)}｜` +
                            `中位 ${String(chart.box.median)}｜P75 ${String(chart.box.p75)}｜最大 ${String(chart.box.max)}` +
                            `（P25–P75 区间里 ${String(chart.box.withinBox)} 条）`);
                    lines.push(`  ${chart.note}`);
                }
                // F2：本地基准 —— 基准**只能**是自己抓到的岗位库（本项目没有数据源）
                if (what === 'baseline' || what === 'all') {
                    const baseline = analytics.salaryBaseline({
                        ...(city === undefined ? {} : { city }),
                        ...(keyword === undefined ? {} : { keyword }),
                    });
                    lines.push('', `【与本地基准对比 · ${baseline.scope}】`);
                    lines.push(`· 全部在库：${String(baseline.all.count)} 条｜中位 ${String(baseline.all.median)}｜` +
                        `P25 ${String(baseline.all.p25)}｜P75 ${String(baseline.all.p75)}`);
                    lines.push(`· 我投递过的：${String(baseline.applied.count)} 条｜中位 ${String(baseline.applied.median)}`);
                    lines.push(baseline.medianGap === null
                        ? '· 差额：无法计算（有一边没有样本）'
                        : `· 中位数之差：${baseline.medianGap > 0 ? '+' : ''}${String(baseline.medianGap)} 元/月` +
                            (baseline.enoughSample ? '' : '（样本不足，别看差额）'));
                    lines.push(`  ${baseline.note}`);
                }
                // F3：简历 A/B 对比 —— 每格给分子/分母，薄格子标出来
                if (what === 'resume' || what === 'all') {
                    const compare = analytics.resumeCompare();
                    lines.push('', '【简历版本 A/B 对比】');
                    if (compare.rows.length === 0)
                        lines.push('· 还没有投递记录');
                    for (const row of compare.rows) {
                        const cells = row.cells
                            .filter((cell) => cell.count > 0)
                            .map((cell) => `${cell.label} ${String(cell.count)}/${String(row.total)}${cell.thin ? '（样本少）' : ''}`)
                            .join('｜');
                        lines.push(`· ${row.label}（投 ${String(row.total)}）：${cells === '' ? '—' : cells}`);
                    }
                    lines.push(`  ${compare.note}`);
                }
                return { text: lines.join('\n') };
            },
        }),
    ];
}
//# sourceMappingURL=analytics.js.map