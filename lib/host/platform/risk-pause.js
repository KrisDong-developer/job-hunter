export const RISK_PAUSE_KEY = 'risk-paused';
export const RISK_PAUSE_SCOPE = 'platform';
/**
 * 读某个平台的风控暂停状态。
 *
 * 裸 `true` 也认，理由与全局暂停开关一样：兼容手工写过这个键的库 ——
 * 不认的话"看起来暂停了、实际没暂停"，比不兼容更糟。
 */
export function readPlatformRiskPause(store, platformId) {
    const stored = store.setting.get(RISK_PAUSE_KEY, RISK_PAUSE_SCOPE, platformId);
    if (stored === true)
        return { paused: true, reason: null, at: null };
    if (stored !== null && typeof stored === 'object') {
        const record = stored;
        return {
            paused: true,
            reason: typeof record.reason === 'string' && record.reason !== '' ? record.reason : null,
            at: typeof record.at === 'string' ? record.at : null,
        };
    }
    return { paused: false, reason: null, at: null };
}
export function setPlatformRiskPause(store, platformId, reason, now) {
    store.setting.set(RISK_PAUSE_KEY, RISK_PAUSE_SCOPE, platformId, { reason, at: now }, now);
}
export function clearPlatformRiskPause(store, platformId) {
    store.setting.remove(RISK_PAUSE_KEY, RISK_PAUSE_SCOPE, platformId);
}
/**
 * 方案级 `riskPaused` 的派生口径：**该方案下所有平台都被风控暂停**。
 *
 * 语义上它回答的仍是"这个方案现在能不能自动跑"，但不再是独立的一份状态 ——
 * 独立存储一定会跟平台级的真值漂移（一个方案有 5 个平台，5 个状态）。
 * 0 个平台时返回 false：没有平台的方案由 `plan_disabled` / 校验去管，不归这里。
 */
export function allPlatformsRiskPaused(store, platformIds) {
    return platformIds.length > 0 && platformIds.every((id) => readPlatformRiskPause(store, id).paused);
}
//# sourceMappingURL=risk-pause.js.map