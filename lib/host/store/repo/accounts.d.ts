import type { DatabaseSync } from 'node:sqlite';
/** 一个平台的账号/登录态。**绝不存密码**。 */
export interface AccountRecord {
    platformId: string;
    loggedIn: boolean;
    hiddenFromCurrentEmployer: boolean | null;
    lastCheckAt: string | null;
    hint: string | null;
    updatedAt: string | null;
}
export interface AccountUpsertInput {
    platformId: string;
    loggedIn: boolean;
    hiddenFromCurrentEmployer: boolean | null;
    hint: string | null;
}
export interface AccountRepo {
    upsert(input: AccountUpsertInput, now: string): void;
    get(platformId: string): AccountRecord | undefined;
    list(): AccountRecord[];
}
export declare function createAccountRepo(db: DatabaseSync): AccountRepo;
//# sourceMappingURL=accounts.d.ts.map