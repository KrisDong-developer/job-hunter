/**
 * 模型工具注册（§22）—— 工具层的**唯一公共入口**。
 *
 * 三条硬规则贯穿这一族文件：
 *
 * 1. **单一实现**（§22.1）：每个工具都调用 `HostRuntime` 上与 HTTP 路由**同一批**方法，
 *    不新写一套读写。所以"界面上能做的事"与"对话里能做的事"必然产生同样的数据变更。
 * 2. **结构化 + 可读摘要**（§22.1）：`output.schema` 是给宿主的，`output.render` 是给模型的。
 *    `render` 的输出**就是模型的上下文**，所以它必须短、必须克制（§22.5 不塞整段 JD）。
 * 3. **危险动作过闸门**（§22.4）：`greeting_send` / `job_settings` 都走 `runtime` 上的 guard 方法，
 *    工具层**没有**任何绕过闸门的能力 —— 它连危险实现的引用都拿不到。
 *
 * ⚠️ **与 §22.2 清单的一处命名偏差（实测逼出来的）**：
 * 文档里的 `job_list` 与宿主自带的 `job_list`（列出后台任务，见 `@deepseek-ai/dsh-tool-jobs`）
 * **同名**。`tools.register` 对重名会抛错，于是插件版压根没注册上，
 * 而客户端的 toolview（按工具名 keyed）反而**接管**了宿主那个工具的渲染 ——
 * 结果是"列出后台任务"被画成了一张岗位卡片。实测就是这样被发现的。
 * 所以这里叫 `job_query`：语义与文档一致，只是换了个不撞车的名字。
 * 同时：注册失败**不再被静默吞掉**，会记进 `ToolRegistrationReport` 并经 `/health` 暴露。
 *
 * 文件布局（35 个工具按**所消费的领域服务**分组，与 `src/host/domain/` 一一对应）：
 *   kit.ts          共享工具箱（schema / 工具装配 / 参数收敛 / 就绪检查）
 *   types.ts        注册结果契约（叶子模块，避免与 runtime 形成双向类型引用）
 *   jobs.ts         job_*（岗位库）        plans.ts        job_plan_manage（方案与调度配置）
 *   crawl.ts        crawl_*（抓取执行）    outreach.ts     打招呼 / 收件箱 / 消息
 *   applications.ts 投递 / 面试 / 错题本   resumes.ts      resume_*（含导入）
 *   campus.ts       校招                 overseas.ts     海外 / Cover Letter
 *   offers.ts       offer_manage（Offer） analytics.ts    job_report
 *   settings.ts     job_settings         data.ts         data_transfer（导出 / 导入 / 占用 / 清理预览，§18 / J8）
 */
import { PLUGIN_ID } from '../../shared/config/plugin.js';
import { serviceOf } from '../../shared/contract/dsh.js';
import { messageOf } from '../util/errors.js';
import { analyticsTools } from './analytics.js';
import { applicationsTools } from './applications.js';
import { campusTools } from './campus.js';
import { crawlTools } from './crawl.js';
import { dataTools } from './data.js';
import { jobsTools } from './jobs.js';
import { offersTools } from './offers.js';
import { outreachTools } from './outreach.js';
import { overseasTools } from './overseas.js';
import { plansTools } from './plans.js';
import { resumesTools } from './resumes.js';
import { settingsTools } from './settings.js';
// 批量上限是 §22.4 的对外契约（测试与工具描述都用它），所以从公共入口转发一次。
// `TOOL_LIST_MAX` 只在 jobs 域内部使用，不对外暴露。
export { TOOL_BATCH_MAX } from './kit.js';
/**
 * 全部工具，按领域分组拼接。
 *
 * 顺序只影响注册顺序与日志顺序（注册表按**名字**查重，客户端 toolview 也按名字 keyed），
 * 所以分组重排不会改变任何行为。
 */
function buildTools(runtime) {
    return [
        ...jobsTools(runtime),
        ...plansTools(runtime),
        ...crawlTools(runtime),
        ...outreachTools(runtime),
        ...applicationsTools(runtime),
        ...resumesTools(runtime),
        ...offersTools(runtime),
        ...campusTools(runtime),
        ...overseasTools(runtime),
        ...analyticsTools(runtime),
        ...settingsTools(runtime),
        ...dataTools(runtime),
    ];
}
/**
 * 注册全部工具。
 *
 * 为什么返回一份 report：实测踩过 —— 宿主自带 `job_list`，我们的同名工具注册失败，
 * 而失败被 `catch` 吞成了日志里的一行，界面上什么都没说。
 * 「工具静默少了一个」是模型能力缺失里最难查的一类问题，所以这里把它变成可见状态。
 */
export function registerJobHunterTools(ctx, runtime) {
    const report = { registered: [], failed: [], conflicts: [] };
    const tools = serviceOf(ctx, 'tools');
    if (tools === undefined) {
        ctx.logger?.warn(`[${PLUGIN_ID}] tools 服务缺失，模型工具未注册（对话里将无法操作岗位）`);
        return { report, dispose: () => { } };
    }
    // 先看一眼已经存在的名字：这时候别的 bundle 可能还没注册完，
    // 所以这只是"早知道一步"，真正的兜底是下面的 try/catch。
    let taken = new Set();
    try {
        taken = new Set((tools.schemas?.() ?? []).map((schema) => schema.name));
    }
    catch (error) {
        ctx.logger?.warn(`[${PLUGIN_ID}] 读取已有工具清单失败：${messageOf(error)}`);
    }
    const definitions = buildTools(runtime);
    const disposers = [];
    for (const definition of definitions) {
        if (taken.has(definition.name)) {
            report.conflicts.push(definition.name);
            ctx.logger?.error(`[${PLUGIN_ID}] 工具名 ${definition.name} 已被宿主或其它插件占用 —— ` +
                '本插件这个工具没有注册（重名会被 tools.register 拒绝）。请改名后重试。');
        }
        try {
            disposers.push(tools.register(definition));
            report.registered.push(definition.name);
        }
        catch (error) {
            const reason = messageOf(error);
            report.failed.push({ name: definition.name, reason });
            if (!report.conflicts.includes(definition.name))
                report.conflicts.push(definition.name);
            // 这条必须是 error 级：静默少一个工具会让模型"莫名其妙做不到某件事"
            ctx.logger?.error(`[${PLUGIN_ID}] 工具 ${definition.name} 注册失败：${reason} —— ` +
                `本次会话里模型将无法使用它（已注册 ${String(report.registered.length)}/${String(definitions.length)}）。`);
        }
    }
    ctx.logger?.info(`[${PLUGIN_ID}] 已注册 ${String(report.registered.length)}/${String(definitions.length)} 个模型工具（§22.2）` +
        (report.conflicts.length === 0 ? '' : `；没注册上：${report.conflicts.join('、')}`));
    return {
        report,
        dispose: () => {
            for (const dispose of disposers.splice(0).reverse()) {
                try {
                    dispose();
                }
                catch {
                    /* 单个注销失败不影响其余 */
                }
            }
        },
    };
}
//# sourceMappingURL=index.js.map