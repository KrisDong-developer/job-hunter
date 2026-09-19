/**
 * 待办（P3：补跑待办要让用户能关掉）的路由块。
 * 管 GET /todos（列表 + kind/level 筛选）、GET /todos/:id（单条，含 detail）、
 * POST /todos/:id/confirm-actions/resume（把待确认动作意图交回界面重发）、POST /todos/:id/close。
 */
import { TODO_KINDS, TODO_LEVELS } from '../../../shared/contract/enums/today.js';
import { dataNotReady } from '../../runtime/contract.js';
import { DomainError } from '../../util/errors.js';
import { json, parsePositiveInt, requireData } from './kit.js';
/** 与原 `dispatch` 里的同名闭包一致：每次调用取当前时刻。 */
const now = () => new Date().toISOString();
export async function list(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 1 && segments[0] === 'todos')) {
        return undefined;
    }
    requireData(runtime);
    const store = runtime.store();
    if (store === undefined)
        throw dataNotReady(runtime);
    // ── GET /todos 列表 + 筛选（kind / level）────────────────────
    const kindRaw = req.query.get('kind');
    const levelRaw = req.query.get('level');
    if (kindRaw !== null && kindRaw !== '' && !TODO_KINDS.includes(kindRaw)) {
        throw new DomainError('INVALID_INPUT', `非法待办类别：${kindRaw}`, {
            hint: `合法取值：${TODO_KINDS.join(' / ')}`,
        });
    }
    if (levelRaw !== null && levelRaw !== '' && !TODO_LEVELS.includes(levelRaw)) {
        throw new DomainError('INVALID_INPUT', `非法待办级别：${levelRaw}`, {
            hint: `合法取值：${TODO_LEVELS.join(' / ')}`,
        });
    }
    return json(200, {
        items: store.todo.listOpen({
            limit: parsePositiveInt(req.query.get('limit'), 50, 1, 500),
            ...(kindRaw === null || kindRaw === '' ? {} : { kind: kindRaw }),
            ...(levelRaw === null || levelRaw === '' ? {} : { level: levelRaw }),
        }),
        countOpen: store.todo.countOpen(),
    });
}
export async function get(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 2 && segments[0] === 'todos')) {
        return undefined;
    }
    requireData(runtime);
    const store = runtime.store();
    if (store === undefined)
        throw dataNotReady(runtime);
    const todoId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(todoId))
        throw new DomainError('INVALID_INPUT', `非法待办 id：${segments[1] ?? ''}`);
    // ── GET /todos/:id 单条（含 detail）────────────────────────────
    const todo = store.todo.get(todoId);
    if (todo === undefined)
        throw new DomainError('NOT_FOUND', `待办不存在：${String(todoId)}`);
    return json(200, todo);
}
export async function confirmResume(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 4 && segments[0] === 'todos' && segments[2] === 'confirm-actions' && segments[3] === 'resume')) {
        return undefined;
    }
    requireData(runtime);
    const store = runtime.store();
    if (store === undefined)
        throw dataNotReady(runtime);
    const todoId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(todoId))
        throw new DomainError('INVALID_INPUT', `非法待办 id：${segments[1] ?? ''}`);
    // ── D：POST /todos/:id/confirm-actions/resume ─────────────────
    // guard 在审批超时/无界面时把高危动作落成一条 kind='confirm-action' 待办。
    // 正文全文不入库存（§4.1），所以这里不能"原样重放"，而是：
    //   关闭待办 + 把 {action, target, actor} 意图交回界面，由界面带用户到正确上下文重新发起。
    const todo = store.todo.get(todoId);
    if (todo === undefined || todo.state !== 'open') {
        throw new DomainError('NOT_FOUND', `待办不存在或已关闭：${String(todoId)}`);
    }
    if (todo.kind !== 'confirm-action') {
        throw new DomainError('INVALID_INPUT', `这条待办不是待确认动作（kind=${String(todo.kind)}）`);
    }
    const detail = todo.detail;
    const action = detail.action;
    const target = detail.target ?? {};
    if (typeof action !== 'string' || typeof target['jobId'] !== 'number') {
        throw new DomainError('INVALID_INPUT', '这条待确认动作缺少可恢复的目标（action/jobId），无法恢复', {
            hint: '可能来自更早版本；直接关闭即可。',
        });
    }
    store.todo.close(todoId, now());
    return json(200, {
        ok: true,
        intent: { action, actor: detail.actor ?? 'gui', target },
        note: '原正文未入库（隐私策略），已带你到目标上下文；请重新发起。',
    });
}
export async function close(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(segments.length === 3 && segments[0] === 'todos' && segments[2] === 'close')) {
        return undefined;
    }
    requireData(runtime);
    const store = runtime.store();
    if (store === undefined)
        throw dataNotReady(runtime);
    const todoId = Number.parseInt(segments[1] ?? '', 10);
    if (!Number.isFinite(todoId))
        throw new DomainError('INVALID_INPUT', `非法待办 id：${segments[1] ?? ''}`);
    // ── POST /todos/:id/close ─────────────────────────────────────
    // **必须显式判方法**：这一段没有 `method` 条件，而传输层的同源校验只拦非 GET
    // 请求（见 http.ts 的 isSameOrigin 与上面的 `isMutation`）。少了这一判，
    // 一条跨站的 `GET /job-hunter/todos/1/close`（`<img src>` 就够）就能关掉待办 ——
    // 读操作不该有副作用。
    if (method !== 'POST') {
        throw new DomainError('INVALID_INPUT', '关闭待办只支持 POST', {
            hint: '读请求（GET）不该改变任何状态。',
        });
    }
    const closed = store.todo.close(todoId, now());
    if (!closed)
        throw new DomainError('NOT_FOUND', `待办不存在或已关闭：${String(todoId)}`);
    return json(200, { ok: true });
}
//# sourceMappingURL=todos.js.map