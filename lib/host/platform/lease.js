/**
 * 单实例租约锁（§4.1「单实例租约」/ R20）。
 *
 * 桌面端与 CLI 同时开着时，会有**两个调度器同时抓取**、两个浏览器抢同一个 profile。
 * 做法：`$DSH_HOME/job-hunter/lease.json` 记 pid + 心跳；
 * 拿不到租约的实例**不进调度、不开浏览器**，只提供只读面板并提示「另一个实例正在运行」。
 *
 * 心跳比「文件存在」可靠：进程被强杀时文件会留下来，但心跳会停。
 * 因此判据是**心跳是否新鲜**，不是文件是否存在。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { systemClock } from '../util/time.js';
/** 默认 90 秒没有心跳就算对方已经死了。 */
export const LEASE_STALE_MS = 90_000;
function defaultFs() {
    return {
        exists: (path) => existsSync(path),
        read: (path) => readFileSync(path, 'utf8'),
        write: (path, content) => {
            writeFileSync(path, content, 'utf8');
        },
        rename: (from, to) => {
            renameSync(from, to);
        },
        remove: (path) => {
            rmSync(path, { force: true });
        },
        mkdir: (path) => {
            mkdirSync(path, { recursive: true });
        },
    };
}
export function createLease(options) {
    const fs = options.fs ?? defaultFs();
    const clock = options.clock ?? systemClock;
    const staleMs = options.staleMs ?? LEASE_STALE_MS;
    const path = options.path;
    let mine = null;
    const readRecord = () => {
        if (!fs.exists(path))
            return null;
        try {
            const parsed = JSON.parse(fs.read(path));
            if (typeof parsed.pid !== 'number')
                return null;
            return {
                pid: parsed.pid,
                label: typeof parsed.label === 'string' ? parsed.label : '',
                startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : '',
                heartbeatAt: typeof parsed.heartbeatAt === 'string' ? parsed.heartbeatAt : '',
            };
        }
        catch {
            // 半截文件（写的时候被强杀）→ 当作没有租约，可接管
            return null;
        }
    };
    /** 先写临时文件再 rename：避免读到一个写了一半的 JSON。 */
    const writeRecord = (record) => {
        fs.mkdir(dirname(path));
        const temp = `${path}.tmp`;
        fs.write(temp, JSON.stringify(record, null, 2));
        fs.rename(temp, path);
    };
    const isStale = (record) => {
        const beat = new Date(record.heartbeatAt).getTime();
        if (!Number.isFinite(beat))
            return true;
        return new Date(clock()).getTime() - beat > staleMs;
    };
    return {
        acquire() {
            const existing = readRecord();
            if (existing !== null && existing.pid !== options.pid) {
                if (!isStale(existing)) {
                    return { held: false, other: existing, stale: false };
                }
                // 对方已经死了（强杀留下的幽灵锁）→ 接管
                const now = clock();
                mine = { pid: options.pid, label: options.label, startedAt: now, heartbeatAt: now };
                writeRecord(mine);
                return { held: true, other: existing, stale: true };
            }
            const now = clock();
            mine = {
                pid: options.pid,
                label: options.label,
                startedAt: existing?.startedAt ?? now,
                heartbeatAt: now,
            };
            writeRecord(mine);
            return { held: true, other: null, stale: false };
        },
        heartbeat() {
            if (mine === null)
                return;
            mine = { ...mine, heartbeatAt: clock() };
            try {
                writeRecord(mine);
            }
            catch {
                // 心跳写失败不该把调度打断；下一次再试
            }
        },
        release() {
            if (mine === null)
                return;
            const current = readRecord();
            // 只删自己的租约，别把接管者的删掉
            if (current === null || current.pid === options.pid) {
                try {
                    fs.remove(path);
                }
                catch {
                    /* 删不掉也无妨，心跳过期后会自然被接管 */
                }
            }
            mine = null;
        },
        held() {
            return mine !== null;
        },
        status() {
            const current = readRecord();
            return {
                path,
                held: mine !== null && current?.pid === options.pid,
                pid: current?.pid ?? null,
                heartbeatAt: current?.heartbeatAt ?? null,
                startedAt: current?.startedAt ?? null,
                stale: current === null ? true : isStale(current),
            };
        },
    };
}
//# sourceMappingURL=lease.js.map