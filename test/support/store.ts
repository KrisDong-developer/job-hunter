import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore, type Store } from '../../src/host/store/store.js'

/** 造一个临时数据目录；调用方负责在收尾时清理。 */
export function tempDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'jh-test-'))
}

/** 在临时目录里开一个干净的 store。 */
export function openTestStore(dataDir = tempDataDir()): Store {
  return openStore({ dataDir })
}

/**
 * 删掉临时数据目录。
 * Windows 上 sqlite 句柄没关时删除会 EPERM —— 测试收尾不该因此失败，故做成尽力而为。
 */
export function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* 句柄仍被占用：留给系统清理临时目录即可 */
  }
}

/** 固定时钟，便于断言时间字段。 */
export function fixedClock(start = '2026-09-16T00:00:00.000Z'): () => string {
  let tick = 0
  return () => {
    const base = new Date(start).getTime() + tick * 1000
    tick += 1
    return new Date(base).toISOString()
  }
}

/** 夹具 HTML 的绝对路径。 */
export function fixtureHtmlPath(): string {
  return join(import.meta.dirname, '..', 'fixtures', '51job-sz.html')
}
