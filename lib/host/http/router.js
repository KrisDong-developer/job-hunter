import { ConfirmRequiredError } from '../guard/index.js';
import { DomainError, messageOf } from '../util/errors.js';
import * as analytics from './routes/analytics.js';
import * as applications from './routes/applications.js';
import * as campus from './routes/campus.js';
import * as companies from './routes/companies.js';
import * as crawl from './routes/crawl.js';
import * as dedup from './routes/dedup.js';
import * as health from './routes/health.js';
import * as intel from './routes/intel.js';
import * as interviews from './routes/interviews.js';
import { json } from './routes/kit.js';
import * as jobs from './routes/jobs.js';
import * as messages from './routes/messages.js';
import * as ops from './routes/ops.js';
import * as outreach from './routes/outreach.js';
import * as overseas from './routes/overseas.js';
import * as plans from './routes/plans.js';
import * as platforms from './routes/platforms.js';
import * as resumes from './routes/resumes.js';
import * as schedule from './routes/schedule.js';
import * as todos from './routes/todos.js';
/**
 * 路由表。**一个 handler = 一个精确形状**，这里就是全部 HTTP 端点。
 *
 * 后加的路径放在末尾即可 —— 只有文件头列出的那三处"字面量 vs 参数"需要卡次序。
 */
const ROUTES = [
    health.health,
    ops.systemReveal,
    health.today,
    health.events,
    // ── 岗位库：`facets` / `batch/mark` 是字面量，必须排在参数形状之前 ──
    jobs.list,
    jobs.facets,
    jobs.batchMark,
    jobs.detail,
    jobs.mark,
    // ── 抓取 / 公司 / 去重 / 情报 ───────────────────────────────────
    crawl.status,
    crawl.runs,
    crawl.run,
    companies.list,
    companies.review,
    companies.detail,
    dedup.groups,
    dedup.sweep,
    dedup.dropGroup,
    dedup.group,
    dedup.split,
    intel.dictionary,
    intel.recompute,
    // ── 方案、调度、平台与登录 ─────────────────────────────────────
    plans.list,
    plans.create,
    plans.validateDraft,
    plans.validate,
    plans.patch,
    plans.remove,
    plans.run,
    plans.resume,
    crawl.once,
    crawl.dimensions,
    schedule.lease,
    schedule.pause,
    schedule.reasons,
    schedule.schedulerStatus,
    platforms.list,
    // ── 触达（打招呼 / 收件箱 / 接触阶段）与投递 ────────────────────
    outreach.greetingDraft,
    outreach.greetingSend,
    outreach.inboxSync,
    outreach.detectStage,
    applications.deliver,
    platforms.loginStatus,
    platforms.loginStart,
    // ── 待办、留痕、配置 ───────────────────────────────────────────
    todos.list,
    todos.get,
    todos.confirmResume,
    todos.close,
    ops.llmCalls,
    ops.audit,
    ops.settingsGet,
    ops.settingsPatch,
    // ── 简历与附件 ─────────────────────────────────────────────────
    resumes.list,
    resumes.create,
    resumes.get,
    resumes.patch,
    resumes.remove,
    resumes.duplicate,
    resumes.setDefault,
    resumes.preview,
    resumes.exportResume,
    resumes.files,
    resumes.tailor,
    resumes.tailoringsList,
    resumes.tailoringsAdopt,
    // ── 流水线、看板、消息、面试 ───────────────────────────────────
    applications.list,
    applications.create,
    applications.get,
    applications.advance,
    applications.board,
    applications.jobHistory,
    messages.inbox,
    messages.post,
    messages.read,
    messages.reply,
    messages.extractInterview,
    messages.draftReply,
    // `conflicts` / `upcoming` 必须在 `get`（`/interviews/:id`）之前
    interviews.list,
    interviews.create,
    interviews.conflicts,
    interviews.upcoming,
    interviews.get,
    interviews.patch,
    interviews.remove,
    interviews.setState,
    interviews.review,
    interviews.prep,
    // ── 看板分析、跟进建议、话术模板 ───────────────────────────────
    analytics.funnel,
    analytics.attribution,
    analytics.salary,
    analytics.salaryBox,
    analytics.salaryBaseline,
    analytics.resumeCompare,
    applications.followups,
    applications.followupsResolve,
    outreach.greetingTemplates,
    // ── 校招与海外支线 ─────────────────────────────────────────────
    campus.list,
    campus.create,
    campus.get,
    campus.advance,
    campus.assessmentsList,
    campus.assessmentCreate,
    campus.assessmentState,
    campus.tripartiteList,
    campus.tripartiteCreate,
    campus.tripartiteState,
    campus.talksGet,
    campus.talksPost,
    campus.deadlines,
    overseas.analyze,
    overseas.visaGet,
    overseas.visaSet,
    overseas.jobs,
    overseas.timezone,
    overseas.resumeEnglishCheck,
    overseas.coverLettersList,
    overseas.coverLettersCreate,
];
async function dispatch(runtime, req) {
    const segments = req.path.split('/').filter((part) => part !== '');
    const method = req.method.toUpperCase();
    const isMutation = method !== 'GET' && method !== 'HEAD';
    // 变更类请求必须过同源校验（C4：宿主对我们的路由不提供任何鉴权）
    if (isMutation && !req.sameOrigin) {
        return json(403, { ok: false, code: 'CROSS_ORIGIN', message: '跨站请求被拒绝' });
    }
    const ctx = { runtime, req, segments, method };
    for (const handle of ROUTES) {
        const result = await handle(ctx);
        // `undefined` = 这条不接，继续问下一个（穿透语义，见文件头）
        if (result !== undefined)
            return result;
    }
    return json(404, { ok: false, code: 'NOT_FOUND', path: req.path });
}
/**
 * 唯一入口。所有领域错误在这里翻译成 HTTP（§9 映射表）。
 */
export async function routeRequest(runtime, req) {
    try {
        return await dispatch(runtime, req);
    }
    catch (error) {
        if (error instanceof DomainError) {
            return json(error.status, error.toJson());
        }
        // 「需要用户确认」不是拒绝（§4.4.2）：返回 409 + 确认文案，
        // 界面显示给用户，用户同意后带 confirm:true 重发同一个请求。
        if (error instanceof ConfirmRequiredError) {
            return json(409, {
                ok: false,
                code: 'NEEDS_CONFIRM',
                message: error.message,
                action: error.request.action,
                danger: error.request.danger,
                confirmText: error.text(),
            });
        }
        return json(500, { ok: false, code: 'INTERNAL', message: messageOf(error) });
    }
}
//# sourceMappingURL=router.js.map