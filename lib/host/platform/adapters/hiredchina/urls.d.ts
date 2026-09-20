/**
 * HiredChina 列表页 URL 的**宿主机侧**构造（`/<lang>/jobs?kw=&type=&employmentId=&isOnline=&page=`）。
 *
 * 不碰 `document`、不发请求 —— 页面上下文的一切在 `./page.ts`。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js';
import type { HiredChinaConfig } from './config.js';
/** 构造列表页 URL：`/<lang>/jobs?kw=&type=&employmentId=&isOnline=&page=`。 */
export declare function buildHiredChinaSearchUrl(config: HiredChinaConfig, criteria: SearchCriteria): string | null;
//# sourceMappingURL=urls.d.ts.map