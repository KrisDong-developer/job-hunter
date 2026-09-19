/**
 * AI 客户端（§4.5）。
 *
 * 这个模块的职责边界很窄，但每条都是硬要求：
 *   - **用途开关**：关掉的用途绝不调用模型；
 *   - **隐私闸门**：出站前剥黑名单、按白名单裁字段，并记下外发字段清单；
 *   - **留痕**：每次调用写一条 `llm_call`（含用途、外发字段、token、耗时、结果）；
 *   - **降级**：模型不可用/超时/输出不合规，都走调用方给的 `fallback`，
 *     返回 `via: 'fallback'` 让上层能如实标注"这是模板不是模型"，而不是假装成功（J10）。
 */
import type { Store } from '../store/store.js'
import { isoNow } from '../util/time.js'
import { applyPrivacy, redactPatterns } from './privacy.js'
import { buildPrompt, extractJson, type TrustedBlock, type UntrustedBlock } from './prompts.js'
import {
  AI_CONFIG_KEY,
  normalizeAiConfig,
  type AiConfig,
  type AiConfigPatch,
  type AiPurpose,
} from './purposes.js'

/** 模型端口。运行时用 `ctx.llm` 适配，测试用假实现。 */
export interface LlmPort {
  complete(request: {
    system: string
    user: string
    maxTokens?: number
    temperature?: number
  }): Promise<LlmCompletion>
}

export interface LlmCompletion {
  text: string
  provider?: string
  model?: string
  promptTokens?: number
  completionTokens?: number
}

export interface AiCallRequest {
  purpose: AiPurpose
  /** 可信的任务指令。 */
  instruction: string
  /** 结构化字段，会过隐私闸门。 */
  payload?: Record<string, unknown>
  /** 字段白名单；给了就只发这些字段。 */
  allowFields?: readonly string[]
  /**
   * 可信但体量大的正文（简历 JSON、长文等）。
   *
   * 为什么要单独一个口子，而不是塞进 `payload` 或 `instruction`：
   *   * `payload` 只处理**标量**（嵌套对象一律不发）—— 简历是深嵌套结构，塞不进去；
   *   * 塞 `instruction` 能跑，但那样 `outboundFields` 会是空的 ——
   *     于是 `llm_call` 会记成"这次没发任何字段"，而实际上整份简历都发出去了。
   *     **让 I5 的查询结果说假话，比没有留痕更糟。**
   *
   * 这里的文本会计入外发字段清单（记成 `trusted:<label>`），并按模式脱敏
   * （手机号/身份证/邮箱/银行卡）。域层还会在传进来之前先摘掉联系方式字段（防御纵深）。
   */
  trusted?: TrustedBlock[]
  /** 外部不可信文本（JD、聊天记录…），会走结构隔离包装。 */
  untrusted?: UntrustedBlock[]
  outputSpec?: string
  maxTokens?: number
  temperature?: number
  /** 关联实体，写进 `llm_call` 便于溯源。 */
  ref?: Record<string, unknown>
}

export interface AiCallOutcome<T> {
  value: T
  via: 'llm' | 'fallback'
  /** 降级原因或补充说明，UI 应当如实展示。 */
  notes: string[]
  /** 这次实际发出去的字段清单。 */
  outboundFields: string[]
  /** 本次调用的留痕 id（降级未调用模型时为 undefined）。 */
  callId?: number
}

export interface AiCallOptions<T> {
  /** 从模型回复解析结果；返回 undefined 表示不合规，触发降级。 */
  parse: (raw: string) => T | undefined
  /** 规则/模板降级结果。 */
  fallback: () => T
  /** 额外的结果校验（注入防御第三层）。返回字符串表示拒绝并说明原因。 */
  validate?: (value: T) => string | undefined
}

export interface AiService {
  config(): AiConfig
  setConfig(patch: AiConfigPatch): AiConfig
  /** 用途是否可用：总开关 + 该用途开关 + 模型端口存在。 */
  enabled(purpose: AiPurpose): boolean
  available(): boolean
  call<T>(request: AiCallRequest, options: AiCallOptions<T>): Promise<AiCallOutcome<T>>
  /** 供测试与诊断：暴露解析工具。 */
  extractJson(raw: string): unknown
}

export interface AiDeps {
  store: Store
  /** 端口可能迟到（模型未配置）——所以是 getter 而不是实例。 */
  llm: () => LlmPort | undefined
  /** 记录日志/审计用的回调，避免 ai 层直接依赖 guard。 */
  onDegrade?: (info: { purpose: AiPurpose; reason: string }) => void
  timeoutMs?: number
}

export const DEFAULT_AI_TIMEOUT_MS = 30_000

function purposeAllowed(config: AiConfig, purpose: AiPurpose): boolean {
  return config.enabled && config.purposes[purpose] !== false
}

export function createAiService(deps: AiDeps): AiService {
  const { store } = deps
  const timeoutMs = deps.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS

  const readConfig = (): AiConfig => {
    try {
      return normalizeAiConfig(store.setting.get<Partial<AiConfig>>(AI_CONFIG_KEY, 'global'))
    } catch {
      return normalizeAiConfig(undefined)
    }
  }

  const config = readConfig

  const setConfig = (patch: AiConfigPatch): AiConfig => {
    const current = readConfig()
    const next: AiConfig = {
      enabled: patch.enabled ?? current.enabled,
      purposes: { ...current.purposes, ...(patch.purposes ?? {}) },
    }
    store.setting.set(AI_CONFIG_KEY, 'global', '', next, isoNow())
    return next
  }

  const available = (): boolean => deps.llm() !== undefined

  const enabled = (purpose: AiPurpose): boolean =>
    purposeAllowed(readConfig(), purpose) && available()

  const call = async <T>(
    request: AiCallRequest,
    options: AiCallOptions<T>,
  ): Promise<AiCallOutcome<T>> => {
    const notes: string[] = []
    const privacy = applyPrivacy(request.payload ?? {}, { allowFields: request.allowFields })

    // 可信正文：脱敏 + 计入外发字段清单。这两件事必须一起做 ——
    // 只脱敏不记账（或反过来）都会让留痕与实际外发不符。
    const trusted = (request.trusted ?? []).map((block) => {
      const { text, hits } = redactPatterns(block.text)
      if (hits.length > 0) notes.push(`已屏蔽「${block.label}」里的 ${[...new Set(hits)].join('、')}`)
      return { label: block.label, text }
    })
    const trustedFields = trusted.map((block) => `trusted:${block.label}`)
    /** 这次"如果真发出去"会外带的全部字段。 */
    const wouldSend = [...privacy.outboundFields, ...trustedFields]

    const degrade = (reason: string, sent = false): AiCallOutcome<T> => {
      notes.push(reason)
      if (!sent) notes.push('本次没有数据发给模型')
      deps.onDegrade?.({ purpose: request.purpose, reason })
      return {
        value: options.fallback(),
        via: 'fallback',
        notes,
        // 只在**真的发出去过**的时候才声称外发了字段。
        // 没调模型却报一串"外发字段"，会让 I5 的查询结果说假话。
        outboundFields: sent ? wouldSend : [],
      }
    }

    const current = readConfig()
    if (!current.enabled) return degrade('模型功能已关闭，使用模板结果')
    if (current.purposes[request.purpose] === false) {
      return degrade(`用途「${request.purpose}」未开启，使用模板结果`)
    }

    const port = deps.llm()
    if (port === undefined) return degrade('未配置模型，使用模板结果')

    if (privacy.redactedFields.length > 0) {
      notes.push(`已屏蔽字段：${[...new Set(privacy.redactedFields)].join('、')}`)
    }

    const prompt = buildPrompt({
      instruction: request.instruction,
      fields: privacy.safe,
      trusted,
      untrusted: request.untrusted,
      outputSpec: request.outputSpec,
    })

    const startedAt = Date.now()
    let completion: LlmCompletion
    try {
      completion = await withTimeout(
        port.complete({
          system: prompt.system,
          user: prompt.user,
          maxTokens: request.maxTokens,
          temperature: request.temperature,
        }),
        timeoutMs,
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      writeCall(store, {
        purpose: request.purpose,
        fields: wouldSend,
        ref: request.ref,
        durationMs: Date.now() - startedAt,
        ok: false,
        error: reason,
      })
      return degrade(`模型调用失败（${reason}），使用模板结果`, true)
    }

    let parsed = options.parse(completion.text)
    let attemptNote: string | undefined

    if (parsed === undefined) {
      // §4.5：失败重试一次。重试也只要一次 —— 再多就是在跟一个不肯听话的模型耗时间。
      try {
        const retry = await withTimeout(
          port.complete({
            system: prompt.system,
            user: `${prompt.user}\n\n【上一次输出不合规】请严格按要求格式重新输出。`,
            maxTokens: request.maxTokens,
            temperature: 0,
          }),
          timeoutMs,
        )
        completion = retry
        parsed = options.parse(retry.text)
      } catch (error) {
        attemptNote = error instanceof Error ? error.message : String(error)
      }
    }

    if (parsed === undefined) {
      writeCall(store, {
        purpose: request.purpose,
        fields: wouldSend,
        ref: request.ref,
        durationMs: Date.now() - startedAt,
        ok: false,
        error: attemptNote ?? '输出无法解析',
        completion,
      })
      return degrade('模型输出不合规，使用模板结果', true)
    }

    if (options.validate !== undefined) {
      const rejection = options.validate(parsed)
      if (rejection !== undefined) {
        writeCall(store, {
          purpose: request.purpose,
          fields: wouldSend,
          ref: request.ref,
          durationMs: Date.now() - startedAt,
          ok: false,
          error: `结果校验未通过：${rejection}`,
          completion,
        })
        return degrade(`模型结果未通过校验（${rejection}），使用模板结果`, true)
      }
    }

    const callId = writeCall(store, {
      purpose: request.purpose,
      fields: wouldSend,
      ref: request.ref,
      durationMs: Date.now() - startedAt,
      ok: true,
      completion,
    })

    return { value: parsed, via: 'llm', notes, outboundFields: wouldSend, callId }
  }

  return { config, setConfig, enabled, available, call, extractJson }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`超时（${ms}ms）`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

interface CallRecord {
  purpose: AiPurpose
  fields: string[]
  ref?: Record<string, unknown>
  durationMs: number
  ok: boolean
  error?: string
  completion?: LlmCompletion
}

/** 留痕失败不能影响主流程：写日志本身不该让一次对话崩掉。 */
function writeCall(store: Store, record: CallRecord): number | undefined {
  try {
    return store.llmCall.write(
      {
        purpose: record.purpose,
        fields: record.fields,
        ...(record.ref === undefined ? {} : { ref: record.ref }),
        ...(record.completion?.provider === undefined ? {} : { provider: record.completion.provider }),
        ...(record.completion?.model === undefined ? {} : { model: record.completion.model }),
        ...(record.completion?.promptTokens === undefined
          ? {}
          : { promptTokens: record.completion.promptTokens }),
        ...(record.completion?.completionTokens === undefined
          ? {}
          : { completionTokens: record.completion.completionTokens }),
        durationMs: record.durationMs,
        ok: record.ok,
        errorCode: record.error ?? null,
      },
      isoNow(),
    )
  } catch {
    return undefined
  }
}
