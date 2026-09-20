/**
 * 简历中心：版本 CRUD、附件、导出与预览 URL、岗位定制。
 */
import { ROUTE_PREFIX } from '../../shared/config/plugin.js'
import type { ResumeFormat, ResumeTemplate } from '../../shared/contract/enums/resume.js'
import type { GreetingTemplateDto, ResumeDto, ResumeFileDto, ResumeSummaryDto, TailoringDto } from '../../shared/contract/dto/resume.js'
import type { GreetingTone } from '../../shared/contract/enums/pipeline.js'
import type { ResumeContent } from '../../shared/domain/resume-content.js'
import { request } from './client.js'
import type { ResumeDetailDto } from '../../shared/contract/dto/resume.js'

export async function fetchResumes(
  signal?: AbortSignal,
): Promise<{ items: ResumeSummaryDto[] }> {
  return await request<{ items: ResumeSummaryDto[] }>('/resumes', signal === undefined ? {} : { signal })
}

export async function fetchResume(id: number, signal?: AbortSignal): Promise<ResumeDetailDto> {
  return await request<ResumeDetailDto>(`/resumes/${String(id)}`, signal === undefined ? {} : { signal })
}

export async function createResume(input: {
  name: string
  direction?: string
  language?: string
  content: ResumeContent
}): Promise<ResumeDto> {
  const result = await request<{ ok: boolean; resume: ResumeDto }>('/resumes', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.resume
}

export async function updateResume(
  id: number,
  patch: {
    name?: string
    direction?: string
    language?: string
    state?: string
    content?: ResumeContent
    isDefault?: boolean
  },
): Promise<ResumeDto> {
  const result = await request<{ ok: boolean; resume: ResumeDto }>(`/resumes/${String(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return result.resume
}

export async function deleteResume(id: number): Promise<void> {
  await request<{ ok: boolean }>(`/resumes/${String(id)}`, { method: 'DELETE' })
}

export async function duplicateResume(id: number, name?: string): Promise<ResumeDto> {
  const result = await request<{ ok: boolean; resume: ResumeDto }>(
    `/resumes/${String(id)}/duplicate`,
    { method: 'POST', body: JSON.stringify(name === undefined ? {} : { name }) },
  )
  return result.resume
}

export async function setDefaultResume(id: number): Promise<ResumeDto> {
  const result = await request<{ ok: boolean; resume: ResumeDto }>(`/resumes/${String(id)}/default`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return result.resume
}

export async function exportResume(
  id: number,
  input: { format: ResumeFormat; template?: ResumeTemplate },
): Promise<ResumeFileDto> {
  const result = await request<{ ok: boolean; file: ResumeFileDto }>(
    `/resumes/${String(id)}/export`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  return result.file
}

/** 预览与附件都是直接给浏览器一个 URL（PDF 用内联，浏览器自己就能看）。 */
export function previewUrl(id: number, template?: ResumeTemplate): string {
  return `${ROUTE_PREFIX}/resumes/${String(id)}/preview${template === undefined ? '' : `?template=${template}`}`
}

export function fileUrl(fileId: number): string {
  return `${ROUTE_PREFIX}/files/${String(fileId)}`
}

/** 删除一个附件（源文件与记录一起删）。界面上写着"只有你显式删除才会消失"，这就是那个删除。 */
export async function deleteFile(fileId: number): Promise<void> {
  await request<{ ok: boolean }>(`/files/${String(fileId)}`, { method: 'DELETE' })
}

export async function tailorResume(input: {
  jobId: number
  resumeId?: number
  useLlm?: boolean
}): Promise<TailoringDto> {
  const result = await request<{ ok: boolean; tailoring: TailoringDto }>('/resume/tailor', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.tailoring
}

export async function fetchTailorings(
  filter: { jobId?: number; resumeId?: number; limit?: number },
  signal?: AbortSignal,
): Promise<{ items: TailoringDto[] }> {
  const query = new URLSearchParams()
  if (filter.jobId !== undefined) query.set('jobId', String(filter.jobId))
  if (filter.resumeId !== undefined) query.set('resumeId', String(filter.resumeId))
  if (filter.limit !== undefined) query.set('limit', String(filter.limit))
  return await request<{ items: TailoringDto[] }>(
    `/tailorings?${query.toString()}`,
    signal === undefined ? {} : { signal },
  )
}

export async function adoptTailoring(id: number, adopted: boolean): Promise<TailoringDto> {
  const result = await request<{ ok: boolean; tailoring: TailoringDto }>(
    `/tailorings/${String(id)}/adopt`,
    { method: 'POST', body: JSON.stringify({ adopted }) },
  )
  return result.tailoring
}

// ── 话术模板（v12 多赛道）：简历中心「话术」子页 ─────────────────────

export async function fetchGreetingTemplates(
  resumeId: number,
  signal?: AbortSignal,
): Promise<{ items: GreetingTemplateDto[] }> {
  return await request<{ items: GreetingTemplateDto[] }>(
    `/resumes/${String(resumeId)}/greeting-templates`,
    signal === undefined ? {} : { signal },
  )
}

export async function generateGreetingTemplate(
  resumeId: number,
  tone: GreetingTone,
): Promise<GreetingTemplateDto> {
  const result = await request<{ ok: boolean; template: GreetingTemplateDto }>(
    `/resumes/${String(resumeId)}/greeting-templates/generate`,
    { method: 'POST', body: JSON.stringify({ tone }) },
  )
  return result.template
}

export async function saveGreetingTemplate(
  resumeId: number,
  input: { id?: number; name: string; body: string },
): Promise<GreetingTemplateDto> {
  const result = await request<{ ok: boolean; template: GreetingTemplateDto }>(
    `/resumes/${String(resumeId)}/greeting-templates`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  return result.template
}

export async function deleteGreetingTemplate(resumeId: number, templateId: number): Promise<void> {
  await request<{ ok: boolean }>(`/resumes/${String(resumeId)}/greeting-templates/${String(templateId)}`, {
    method: 'DELETE',
  })
}

// ── P7：跟进、消息、面试、看板 ────────────────────────────────────────

