/**
 * 51job 的 URL 构造（宿主机侧）：字段 → URL 参数的拼装，**不碰 `document`**。
 *
 * ⚠️ 本平台唯一一处签名变更：原实现是工厂内的闭包（读闭包里的 `config`），
 * 搬到这里后 `config` 变成第一个显式参数，闭包体一字未改。
 *
 * 完整实测记录（字段映射来源、SR-40 抓取深度三件套为什么不塞默认值）见 `./index.ts` 文件头。
 */
import type { SearchCriteria } from '../../types.js';
import type { FiftyOneConfig } from './config.js';
export declare function buildSearchUrl(config: FiftyOneConfig, criteria: SearchCriteria): string | null;
//# sourceMappingURL=urls.d.ts.map