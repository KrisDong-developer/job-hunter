/**
 * 运维面：设置读写、数据目录、审计与模型调用留痕、存储清理、导入导出、待办。
 */
import { ROUTE_PREFIX } from '../../shared/config/plugin.js'
import type { CleanupPlanDto, CleanupResultDto, DataImportResultDto, StorageUsageDto } from '../../shared/contract/dto/storage.js'
import { request } from './client.js'
import type { AuditRecordDto, LlmCallDto, SettingsDto } from '../../shared/contract/dto/settings.js'
import type { ConfirmActionIntentDto } from '../../shared/contract/dto/today.js'

export async function closeTodo(id: number): Promise<void> {
  await request<{ ok: boolean }>(`/todos/${String(id)}/close`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/**
 * 恢复一条「待确认动作」待办（guard 在审批超时/无界面时落下的那种）。
 *
 * ⚠️ 它**不重放**原动作：正文不入库（§4.1），所以宿主只做两件事 ——
 * 关掉这条待办、把 `{action, actor, target}` 意图交回界面。
 * "带用户回到目标岗位重新发起"那一步在界面这一侧。
 */
export async function resumeConfirmAction(
  id: number,
): Promise<{ intent: ConfirmActionIntentDto; note: string }> {
  const result = await request<{ ok: boolean; intent: ConfirmActionIntentDto; note: string }>(
    `/todos/${String(id)}/confirm-actions/resume`,
    { method: 'POST', body: JSON.stringify({}) },
  )
  return { intent: result.intent, note: result.note }
}

// ── P5：话术 / 审批 / 审计 / 配置 ────────────────────────────────────

export async function fetchSettings(signal?: AbortSignal): Promise<SettingsDto> {
  return await request<SettingsDto>('/settings', signal === undefined ? {} : { signal })
}

/**
 * 在系统文件管理器里打开数据文件所在目录。
 *
 * 浏览器没有打开本机文件夹的能力，所以这件事由宿主半执行 ——
 * 而且它**只认数据文件自己的目录**，界面传不了路径（见 `host/util/reveal.ts`）。
 *
 * 返回 `ok: false` 是**业务结果**（宿主里没有文件管理器），不是协议错误：
 * 界面要如实转述，不能一律说"已打开"。
 */
export async function revealDataDir(): Promise<{ dir: string; ok: boolean; reason: string | null }> {
  const result = await request<{ ok: boolean; dir: string; reason?: string }>('/system/reveal', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return { dir: result.dir, ok: result.ok, reason: result.reason ?? null }
}

export async function updateSettings(patch: {
  ai?: Record<string, unknown>
  guard?: Record<string, unknown>
  browser?: Record<string, unknown>
  crawl?: Record<string, unknown>
  /** 数据保留策略（§18）。资源设置，不是闸门，所以不需要审批。 */
  retention?: Record<string, unknown>
}): Promise<SettingsDto> {
  const result = await request<{ ok: boolean; settings: SettingsDto }>('/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return result.settings
}

export async function fetchAudit(
  limit = 50,
  filter: { actor?: string; action?: string } = {},
  signal?: AbortSignal,
): Promise<{ items: AuditRecordDto[]; count: number; note: string }> {
  const query = new URLSearchParams({ limit: String(limit) })
  if (filter.actor !== undefined && filter.actor !== '') query.set('actor', filter.actor)
  if (filter.action !== undefined && filter.action !== '') query.set('action', filter.action)
  return await request(`/audit?${query.toString()}`, signal === undefined ? {} : { signal })
}

export async function fetchLlmCalls(
  limit = 50,
  signal?: AbortSignal,
): Promise<{
  items: LlmCallDto[]
  stats: Array<{ purpose: string; calls: number; promptTokens: number; completionTokens: number }>
  note: string
}> {
  return await request(`/llm/calls?limit=${String(limit)}`, signal === undefined ? {} : { signal })
}

// ── P6：简历 ─────────────────────────────────────────────────────────

/** 磁盘占用（§18.3 P3）：真实文件大小 + 按表占用 + 按类型的行数。 */
export async function fetchStorage(signal?: AbortSignal): Promise<StorageUsageDto> {
  return await request<StorageUsageDto>('/maintenance/storage', signal === undefined ? {} : { signal })
}

/**
 * 清理预览（§18.3 P2，P0）：**只读、无副作用**，可以放心反复调。
 *
 * 界面必须先拉到它、把将删什么显示给用户，用户点过确认之后才发 `/maintenance/cleanup`。
 */
export async function previewCleanup(): Promise<CleanupPlanDto> {
  return await request<CleanupPlanDto>('/maintenance/cleanup/preview', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/** 执行清理（不可逆）。`only` 只清这几类；缺省 = 预览里所有会执行的项。 */
export async function runCleanup(input: { only?: string[] } = {}): Promise<CleanupResultDto> {
  const result = await request<{ ok: boolean; result: CleanupResultDto }>('/maintenance/cleanup', {
    method: 'POST',
    body: JSON.stringify({ confirm: true, ...input }),
  })
  return result.result
}

/**
 * 导出的下载地址（直接给 `<a href>` 或 `window.open` 用）。
 *
 * 为什么不做成 `fetch` + Blob：导出的东西是文件，浏览器的原生下载更稳
 * （大文件不进 JS 堆、断点与文件名都交给浏览器）。与简历附件的打开方式一致。
 */
export function dataExportUrl(format: 'json' | 'csv' | 'archive'): string {
  return `${ROUTE_PREFIX}/data/export?format=${format}`
}

/** 导入岗位（CSV / JSON）。**幂等** —— 同一份表导两次只会更新。 */
export async function importJobsPayload(input: {
  format: 'csv' | 'json'
  content: string
}): Promise<DataImportResultDto> {
  const result = await request<{ ok: boolean; result: DataImportResultDto }>('/data/import', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.result
}

// ── P8：校招与海外支线 ───────────────────────────────────────────────

