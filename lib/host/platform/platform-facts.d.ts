import type { AdapterMaturityFact, AuthRequirementFact } from './types.js';
export interface PlatformFacts {
    maturity: AdapterMaturityFact;
    authRequirement: AuthRequirementFact;
}
/**
 * 已注册平台的认知表。键 = `SiteAdapter.id`。
 *
 * 分级口径见 `MATURITY_LEVEL_LABEL`；这里的分档依据是**证据强度**：
 *   * `stable`       = 真实夹具 + 真机冒烟通过；
 *   * `calibrated`   = 真实探针/响应夹具验证过，但有已知未覆盖的部分；
 *   * `experimental` = 夹具缺失、关键契约未确证、或没有测试；
 *   * `disabled`     = 平台侧已不可用（需改配置才启用）。
 */
export declare const PLATFORM_FACTS: Record<string, PlatformFacts>;
/**
 * 取某个平台的事实。
 *
 * 未登记的 id **不抛错**（否则新增适配器会以最难查的方式失败），
 * 而是给一个**保守默认**：实验性 + 全部未验证。
 * 这会同时让它在界面上显示为"实验"，以及被契约测试点名。
 */
export declare function platformFacts(id: string): PlatformFacts;
//# sourceMappingURL=platform-facts.d.ts.map