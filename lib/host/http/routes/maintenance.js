/**
 * 数据维护路由（§18）：磁盘占用、清理预览、清理执行。
 *
 * ## 三条形状上的讲究
 *
 * 1. **预览与执行分开**，而且预览是 `POST .../preview` 而不是嵌在 GET 里：
 *    §18.3 把「清理前预览」定为 P0，它必须能被反复调用而**不改变任何东西**。
 *    单独一条路径让"有没有副作用"在读路由表时就能回答。
 * 2. 执行**必须带 `confirm: true`**：不带就是 400 并提示先看预览。
 *    这不是形式主义 —— 清理是本项目唯一会**删用户数据**的动作，
 *    默认拒绝"一个没看过预览的调用方"比事后道歉便宜。
 * 3. **清理与导入都要求持有租约**（在运行时里断言）：只读实例（另一个窗口在跑）
 *    不该写库。这条与 `crawl` / `startLogin` 是同一条纪律。
 *
 * 为什么不用 `ConfirmRequiredError` 那套 409 两段式：那套是为**危险动作的审批**
 * （发送/投递，要显示发给谁、正文全文）设计的，而清理的"确认"要展示的是
 * **将删什么** —— 那是预览接口的返回值，界面先拉预览、弹窗、再把 `confirm: true` 发过来。
 * 两条路径各司其职，不必把审批那套塞进维护动作里。
 */
import { DomainError } from '../../util/errors.js';
import { json, readObject, requireData } from './kit.js';
// ── GET /maintenance/storage ───────────────────────────────────────
export async function storage(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'GET' && segments.length === 2 && segments[0] === 'maintenance' && segments[1] === 'storage')) {
        return undefined;
    }
    requireData(runtime);
    return json(200, runtime.storage());
}
// ── POST /maintenance/cleanup/preview ──────────────────────────────
export async function cleanupPreview(ctx) {
    const { runtime, segments, method } = ctx;
    if (!(method === 'POST' &&
        segments.length === 3 &&
        segments[0] === 'maintenance' &&
        segments[1] === 'cleanup' &&
        segments[2] === 'preview')) {
        return undefined;
    }
    requireData(runtime);
    return json(200, runtime.cleanupPreview());
}
// ── POST /maintenance/cleanup ──────────────────────────────────────
export async function cleanup(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(method === 'POST' && segments.length === 2 && segments[0] === 'maintenance' && segments[1] === 'cleanup')) {
        return undefined;
    }
    requireData(runtime);
    const body = await readObject(req);
    if (body['confirm'] !== true) {
        // 文案里直接给出下一步：只说"需要确认"是死胡同提示
        throw new DomainError('INVALID_INPUT', '清理数据需要显式确认', {
            hint: '先调 POST /maintenance/cleanup/preview 看清将删什么，把结果给用户看过之后再带 confirm: true 重发。',
        });
    }
    // `only` 只认预览里出现过的 id：拼错的 id 静默变成"什么都没清"最让人困惑
    let only;
    if (body['only'] !== undefined) {
        if (!Array.isArray(body['only'])) {
            throw new DomainError('INVALID_INPUT', 'only 必须是字符串数组（要清理的类别 id）');
        }
        const known = new Set(runtime.cleanupPreview().items.map((item) => item.id));
        const wanted = body['only'].filter((value) => typeof value === 'string');
        const unknown = wanted.filter((id) => !known.has(id));
        if (unknown.length > 0) {
            throw new DomainError('INVALID_INPUT', `不认识的数据类别：${unknown.join('、')}`, {
                hint: `合法取值见 POST /maintenance/cleanup/preview 的 items[].id。`,
            });
        }
        only = wanted;
    }
    return json(200, { ok: true, result: runtime.runCleanup(only) });
}
//# sourceMappingURL=maintenance.js.map