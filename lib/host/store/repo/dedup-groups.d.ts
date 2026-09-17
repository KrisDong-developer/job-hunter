import type { DatabaseSync } from 'node:sqlite';
/**
 * 跨平台去重分组（§7 `dedup_group` / §4.10.1）。
 *
 * 铁律：
 *   1. **不确定时宁可不合并** —— 把两家公司/两个岗位混在一起，投递记录与状态机会全乱，
 *      而且用户很难发现；
 *   2. **去重必须可逆** —— 成员是显式 id 列表，人工能拆开；
 *   3. **每次合并记录依据** —— `basis` 存的是可读的判断链，不是分数。
 */
export interface DedupGroupRecord {
    id: number;
    primaryJobId: number | null;
    memberIds: number[];
    basis: string;
    score: number;
    createdAt: string;
}
export interface DedupGroupRepo {
    create(input: {
        primaryJobId: number;
        memberIds: number[];
        basis: string;
        score: number;
    }, now: string): number;
    /** 把一个岗位加进已有分组（会同步更新该岗位的 `dedup_group_id`）。 */
    addMember(groupId: number, jobId: number): void;
    get(id: number): DedupGroupRecord | undefined;
    /** 查某个岗位所在的分组。 */
    findByJob(jobId: number): DedupGroupRecord | undefined;
    list(limit: number): DedupGroupRecord[];
    count(): number;
}
export declare function createDedupGroupRepo(db: DatabaseSync): DedupGroupRepo;
//# sourceMappingURL=dedup-groups.d.ts.map