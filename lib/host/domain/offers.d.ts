/**
 * Offer 领域服务（§4.H H1/H2/H3/H4 / §13 U8）。
 *
 * ## 这个服务解决的是求职里最后一段决策
 *
 * 拿到 offer 之后的问题与前面全都不同：不是"投不投"，而是
 * **"这些条件摆在一起，我到底签哪个、还要不要再等等"**（§3.8）。所以三件事：
 *   1. `list/upcoming` —— 截止倒计时（H3：错过就是自动放弃）；
 *   2. `compare` —— H1 的逐项对比表：差异要自己跳出来，而不是让人对着两屏数字看；
 *   3. `compare` 里的 `facts` —— **不依赖模型的规则结论**（谁给得多、谁快到期、谁缺关键项）。
 *
 * ## 两条刻意的克制
 *
 * 1. **不做自动状态流转**：`pending → expired` 不由时间决定。用户刚谈妥延期时，
 *    自动改写会把事实改错，而 offer 的状态是决策依据，不是缓存。
 * 2. **模型只给建议，不下结论**：`advice` 是文字建议，且用途 `offer_compare`
 *    默认关闭；关掉时对比表照常可用（`facts` 是规则算的）。"该签哪个"这件事
 *    牵扯薪资、家庭、通勤、成长，谁也不该替用户拍板。
 */
import type { OfferState } from '../../shared/enums.js';
import type { OfferCompareDto, OfferDeadlineDto, OfferDto } from '../../shared/dto.js';
import type { AiService } from '../ai/client.js';
import type { Store } from '../store/store.js';
import { type Clock } from '../util/time.js';
export interface OfferWriteInput {
    companyId?: number | null;
    companyName?: string;
    jobId?: number | null;
    applicationId?: number | null;
    role?: string;
    /** 待遇明细（整份替换；由仓储边界归一化）。 */
    comp?: unknown;
    deadline?: string | null;
    state?: OfferState;
    note?: string | null;
}
export interface OfferService {
    list(filter?: {
        state?: OfferState;
        companyId?: number;
        openOnly?: boolean;
        limit?: number;
    }): OfferDto[];
    get(id: number): OfferDto;
    create(input: OfferWriteInput): OfferDto;
    update(id: number, patch: OfferWriteInput): OfferDto;
    setState(id: number, state: OfferState): OfferDto;
    remove(id: number): boolean;
    /** 某个岗位的 offer（岗位详情要能回答"这个岗位走到哪一步了"）。 */
    byJob(jobId: number): OfferDto[];
    /** H1：并排对比 + 差异 + 规则结论 +（可选）模型建议。 */
    compare(input?: {
        offerIds?: number[];
        useLlm?: boolean;
    }): Promise<OfferCompareDto>;
    /** H3：`days` 天内截止（含已过期）且还没决定的 —— 今日与提醒的数据面。 */
    upcoming(days: number): OfferDeadlineDto[];
    openCount(): number;
}
export interface OfferServiceDeps {
    store: Store;
    clock?: Clock;
    ai?: AiService | undefined;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
export declare function createOfferService(deps: OfferServiceDeps): OfferService;
//# sourceMappingURL=offers.d.ts.map