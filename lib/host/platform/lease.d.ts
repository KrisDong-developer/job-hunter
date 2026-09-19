import type { LeaseStatusDto } from '../../shared/contract/dto/plan.js';
import { type Clock } from '../util/time.js';
export interface LeaseRecord {
    pid: number;
    label: string;
    startedAt: string;
    heartbeatAt: string;
}
export interface LeaseVerdict {
    held: boolean;
    /** 被别人占着时的对方记录。 */
    other: LeaseRecord | null;
    /** 对方的租约已过期（心跳太旧）。 */
    stale: boolean;
}
export interface LeaseManager {
    /** 尝试取得租约。过期租约会直接被接管。 */
    acquire(): LeaseVerdict;
    heartbeat(): void;
    release(): void;
    held(): boolean;
    status(): LeaseStatusDto;
}
export interface LeaseOptions {
    /** 租约文件路径。 */
    path: string;
    pid: number;
    label: string;
    /** 心跳超过这个时长即视为过期。 */
    staleMs?: number;
    clock?: Clock;
    /** 便于测试注入文件系统。 */
    fs?: {
        exists(path: string): boolean;
        read(path: string): string;
        write(path: string, content: string): void;
        rename(from: string, to: string): void;
        remove(path: string): void;
        mkdir(path: string): void;
    };
}
/** 默认 90 秒没有心跳就算对方已经死了。 */
export declare const LEASE_STALE_MS = 90000;
export declare function createLease(options: LeaseOptions): LeaseManager;
//# sourceMappingURL=lease.d.ts.map