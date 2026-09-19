/**
 * 海外支线：工签/远程判定、时区换算、英语检查、Cover Letter。
 */
import type { CoverLetterDto, TimezoneDisplayDto, VisaRequirementDto } from '../../shared/dto.js'
import type { CoverLetterLanguage, RemoteKind } from '../../shared/enums.js'
import { request } from './client.js'

export async function analyzeOverseas(
  jobId: number,
): Promise<VisaRequirementDto & { remoteKind: RemoteKind; campusBatch: string | null }> {
  return await request<VisaRequirementDto & { remoteKind: RemoteKind; campusBatch: string | null }>(
    '/overseas/analyze',
    { method: 'POST', body: JSON.stringify({ jobId }) },
  )
}

export async function fetchTimezone(at: string, tz: string, signal?: AbortSignal): Promise<TimezoneDisplayDto> {
  const query = new URLSearchParams({ at, tz })
  return await request<TimezoneDisplayDto>(`/timezone?${query.toString()}`, signal === undefined ? {} : { signal })
}

export async function fetchEnglishCheck(
  resumeId: number,
  signal?: AbortSignal,
): Promise<{ items: Array<{ level: 'error' | 'warn'; message: string }>; note: string }> {
  return await request(`/resumes/${String(resumeId)}/english-check`, signal === undefined ? {} : { signal })
}

export async function draftCoverLetter(input: {
  jobId: number
  language?: CoverLetterLanguage
  resumeId?: number
  useLlm?: boolean
}): Promise<CoverLetterDto> {
  const result = await request<{ ok: boolean; coverLetter: CoverLetterDto }>('/cover-letters', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.coverLetter
}

