/**
 * 平台与登录态路由：`GET /platforms`（已注册平台列表）、`GET /login/status`（各平台登录态）、
 * `POST /platforms/:id/login/start`（拉起登录引导）、
 * `GET|PUT /platforms/:id/adapter-config`（适配器配置覆盖，**热生效**）。
 *
 * 调度自身状态（/schedule/*、/scheduler/status）见 schedule.ts；触达相关
 * （/jobs/:id/greeting/draft、/jobs/:id/detect-stage 等）见 outreach.ts。
 * 待修复队列见 repairs.ts。
 */
import { DomainError } from '../../util/errors.js';
import { json, readObject, requireData } from './kit.js';
/** 原 router.ts L1106-1109。 */
export async function list(ctx) {
    const { runtime, segments, method } = ctx;
    // ── 平台与登录态（P3）──────────────────────────────────────────────
    if (method === 'GET' && segments.length === 1 && segments[0] === 'platforms') {
        return json(200, { items: runtime.platforms() });
    }
    return undefined;
}
/** 原 router.ts L1218-1220。 */
export async function loginStatus(ctx) {
    const { runtime, segments, method } = ctx;
    if (method === 'GET' && segments.length === 2 && segments[0] === 'login' && segments[1] === 'status') {
        return json(200, { items: runtime.loginStatuses() });
    }
    return undefined;
}
/** 原 router.ts L1222-1229。 */
export async function loginStart(ctx) {
    const { runtime, segments, method } = ctx;
    if (segments.length === 4 && segments[0] === 'platforms' && segments[2] === 'login' && segments[3] === 'start') {
        if (method !== 'POST') {
            throw new DomainError('INVALID_INPUT', '登录引导只支持 POST');
        }
        requireData(runtime);
        const platformId = segments[1] ?? '';
        return json(200, { ok: true, login: runtime.startLogin(platformId) });
    }
    return undefined;
}
/**
 * `GET|PUT /platforms/:id/adapter-config` —— 适配器配置覆盖（J2 / ADAPTERS.md §4）。
 *
 * 修一个坏掉的选择器，此前**只能直接写 sqlite**（ADAPTERS.md §1 的"实测与源码注释不一致"
 * 那一格）。这一组端点补上的是那条写入路径，并且：
 *   * 读回**三层**（代码默认 / DB 覆盖 / 实际生效）—— 否则"改了没生效"无法自查；
 *   * 写完全**热替换适配器**（J2：不依赖发版、也不要求重启插件）；
 *   * `override: null` = 清除覆盖，回到代码默认（比"写一个空对象"语义明确）。
 *
 * 注意它是**中危**动作（改的是抓取行为的配置），但不像发送那样有对外副作用，
 * 所以走同源校验即可，不需要审批闸门 —— 与 `PATCH /settings` 同级。
 */
export async function adapterConfig(ctx) {
    const { runtime, req, segments, method } = ctx;
    if (!(segments.length === 3 && segments[0] === 'platforms' && segments[2] === 'adapter-config'))
        return undefined;
    requireData(runtime);
    const platformId = segments[1] ?? '';
    if (platformId === '')
        throw new DomainError('INVALID_INPUT', '平台 id 不能为空');
    if (method === 'GET') {
        return json(200, runtime.adapterConfig(platformId));
    }
    if (method !== 'PUT') {
        throw new DomainError('INVALID_INPUT', '适配器配置只支持 GET / PUT', {
            hint: 'PUT 用整份替换语义（与 criteria / platformOverrides 一致），只写你要改的键即可。',
        });
    }
    const body = await readObject(req);
    // `override` 必须显式出现：把"没传"与"传了 null（清除覆盖）"区分开 ——
    // 否则一次拼错的请求体会被当成"清除覆盖"，删掉用户刚写好的选择器
    if (!Object.prototype.hasOwnProperty.call(body, 'override')) {
        throw new DomainError('INVALID_INPUT', 'PUT 需要提供 override 字段', {
            hint: '传一个 JSON 对象写入覆盖；传 null 清除覆盖、回到代码默认。',
        });
    }
    const override = body['override'];
    return json(200, {
        ok: true,
        config: runtime.updateAdapterConfig(platformId, override ?? null),
    });
}
//# sourceMappingURL=platforms.js.map