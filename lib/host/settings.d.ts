/**
 * 插件配置门面（§22.2 `job_settings` / §15）。
 *
 * 界面上改配置、模型工具改配置、审计三者必须**同一套写入路径** ——
 * 否则"模型改了一个开关但界面上看不到"这种事故迟早发生。
 *
 * 写 guard 配置必须持有 guard 令牌（`guardToken` 参数强制），
 * 所以 `settings.write` 这个动作也要过闸门：中危 + 界面发起 → 不打扰用户；
 * 中危 + 模型发起 → 走审批（模型扩大自身权限正是 D-14 要防的事）。
 */
import type { AiConfig, AiConfigPatch } from './ai/purposes.js';
import type { BrowserConfig } from './browser-config.js';
import type { SettingsWriteDeps } from './guard/actions/settings.js';
import type { GuardToken } from './guard/token.js';
import { type GuardConfig } from './guard/rules.js';
import type { SettingsDto } from '../shared/contract/dto/settings.js';
import type { RetentionPolicy } from '../shared/contract/dto/storage.js';
import type { Store } from './store/store.js';
import type { CrawlConfig } from './crawl-config.js';
/**
 * 设置快照 —— 也**就是** HTTP 响应形状。
 *
 * 形状的权威定义在 `shared/contract/dto/settings.ts`，这里直接 extends 那一份：
 * 曾经宿主与客户端各写一遍同名形状，界面只声明"自己用得到的键"，
 * 于是宿主加一个键、客户端就悄悄少了它（`engine` / `stealthInit` 就是这么丢的）。
 * 宿主侧更窄的类型（`BrowserConfig` / `GuardConfig`）都结构兼容于 DTO 的对应字段。
 */
export interface SettingsSnapshot extends SettingsDto {
}
export interface SettingsPatch {
    ai?: AiConfigPatch;
    guard?: Partial<GuardConfig>;
    browser?: Partial<BrowserConfig>;
    crawl?: Partial<CrawlConfig>;
    retention?: Partial<RetentionPolicy>;
}
export interface SettingsService {
    snapshot(): SettingsSnapshot;
    /** 写配置。`guardToken` 由 `guard.run('settings.write')` 签发。 */
    update(patch: SettingsPatch, guardToken: GuardToken): SettingsSnapshot;
}
export interface SettingsDeps extends SettingsWriteDeps {
    ai: {
        config(): AiConfig;
        setConfig(patch: AiConfigPatch): AiConfig;
    };
    /**
     * 浏览器运行期设置。
     *
     * `write` **必须**同时把新值作用到浏览器实例上（不只是落库）——
     * 否则界面上显示"已改成 5 分钟"，实际还是旧值，这类"设置不生效"最难查。
     */
    browser: {
        read(): BrowserConfig;
        write(patch: Partial<BrowserConfig>): BrowserConfig;
    };
    /** 采集运行期设置（单轮预算）。调度器每次开轮都读一次，改完即刻生效。 */
    crawl: {
        read(): CrawlConfig;
        write(patch: Partial<CrawlConfig>): CrawlConfig;
    };
    /** 数据保留策略（§18）。改动即刻生效 —— 预览与清理每次都现读。 */
    retention: {
        read(): RetentionPolicy;
        write(patch: Partial<RetentionPolicy>): RetentionPolicy;
    };
    clock?: () => string;
}
/** 模型**不能**改的键（与 `guard/rules.ts` 的 `FORBIDDEN_FOR_MODEL` 同源）。
 *
 * `retention` 是 2026-09-19 加进来的：它决定"多久之后删数据"，
 * 与额度、冷却期是同一类**保护性配置** —— 让模型能把保留期调成 0 天，
 * 等于给它一个"把用户数据清掉"的间接开关。实现上它本来就不在 `job_settings`
 * 工具的参数里（模型传不进来），这里只是把这条事实**写进用户能看到的清单**里。
 */
export declare const MODEL_FORBIDDEN_KEYS: readonly ["requireApproval", "auditEnabled", "batchLimit", "dailyLimits", "cooldownMinutes", "sendWindow", "dayOffProbability", "retention"];
/** 模型能改的键：只影响"读什么、用什么"，不影响闸门本身。 */
export declare const MODEL_EDITABLE_KEYS: readonly ["ai", "levels", "browser"];
export declare function createSettingsService(deps: SettingsDeps): SettingsService;
/** 把用户能看懂的一行摘要给审批文案用。 */
export declare function describeSettingsPatch(patch: SettingsPatch): string;
/** 供 `store` 参数的类型标注复用。 */
export type { Store };
//# sourceMappingURL=settings.d.ts.map