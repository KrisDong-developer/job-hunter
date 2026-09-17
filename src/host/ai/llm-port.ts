/**
 * 把 DSH 的 `llm` 服务适配成 `LlmPort`（§4.5）。
 *
 * 宿主只提供**流式**接口（`llm.stream(GenerateOptions)`），所以这里收流拼文本。
 * 「一次调用」的语义由 `ai/client.ts` 负责，这一层只做协议搬运：
 *   - 选路（provider/model）优先用本插件自己的设置，否则退回宿主的默认模型；
 *   - `finish` 分片里的 `error` / `aborted` 必须**抛出**，
 *     否则上层会把一个失败的调用当成"模型返回了空字符串"而记成成功。
 *
 * 这里的类型是本插件自己声明的最小结构 —— 不 import DSH 内部类型，
 * 免得宿主重命名一个内部 interface 就把插件编译打断（ADR-2 的同一个理由）。
 */
import type { LlmCompletion, LlmPort } from './client.js'

export interface LlmStreamChunkLike {
  type: string
  text?: string
  reason?: { kind?: string; failure?: { message?: string; code?: string } }
  usage?: { inputTokens?: number; outputTokens?: number }
}

export interface LlmMessageLike {
  id: string
  role: 'user'
  content: Array<{ type: 'text'; text: string }>
  source: { kind: 'plugin'; plugin: string }
}

export interface GenerateOptionsLike {
  provider: string
  model: string
  system?: string
  messages: LlmMessageLike[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

/** `ctx.llm` 的结构投影。 */
export interface LlmSourceLike {
  stream(options: GenerateOptionsLike): AsyncIterable<LlmStreamChunkLike>
}

/** `ctx.agentDefaultModel` 的结构投影。 */
export interface ModelSelectorLike {
  currentSelection(): { provider: string; model: string }
}

export interface Route {
  provider: string
  model: string
}

export interface LlmPortDeps {
  llm: LlmSourceLike
  /** 宿主默认模型；可能不可用（没挂 settings provider 时也有内建默认值）。 */
  defaultModel?: ModelSelectorLike | undefined
  /** 本插件自己的选路设置（覆盖宿主默认）。 */
  route?: () => Partial<Route> | undefined
  pluginId?: string
  onWarn?: (message: string) => void
}

export class LlmRouteUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmRouteUnavailableError'
  }
}

export function resolveRoute(deps: LlmPortDeps): Route {
  const override = deps.route?.() ?? {}
  let provider = override.provider
  let model = override.model

  if (provider === undefined || model === undefined) {
    let selection: { provider: string; model: string } | undefined
    try {
      selection = deps.defaultModel?.currentSelection()
    } catch (error) {
      deps.onWarn?.(`读取默认模型失败：${messageOf(error)}`)
    }
    provider = provider ?? selection?.provider
    model = model ?? selection?.model
  }

  if (provider === undefined || provider === '' || model === undefined || model === '') {
    throw new LlmRouteUnavailableError('没有可用的模型路由（provider/model 未配置）')
  }
  return { provider, model }
}

export function createLlmPort(deps: LlmPortDeps): LlmPort {
  const pluginId = deps.pluginId ?? 'dsh-job-hunter'

  return {
    async complete(request): Promise<LlmCompletion> {
      const route = resolveRoute(deps)
      const options: GenerateOptionsLike = {
        provider: route.provider,
        model: route.model,
        messages: [
          {
            // 本插件自己造的瞬时消息：id 只在本进程内有意义，不入会话历史。
            id: `${pluginId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            role: 'user',
            content: [{ type: 'text', text: request.user }],
            source: { kind: 'plugin', plugin: pluginId },
          },
        ],
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
      }
      if (request.system !== undefined && request.system !== '') options.system = request.system

      let text = ''
      let promptTokens: number | undefined
      let completionTokens: number | undefined
      let failure: string | undefined

      for await (const chunk of deps.llm.stream(options)) {
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
          text += chunk.text
        } else if (chunk.type === 'usage' && chunk.usage !== undefined) {
          promptTokens = chunk.usage.inputTokens ?? promptTokens
          completionTokens = chunk.usage.outputTokens ?? completionTokens
        } else if (chunk.type === 'finish') {
          const kind = chunk.reason?.kind
          if (kind === 'error' || kind === 'aborted') {
            const detail = chunk.reason?.failure?.message ?? chunk.reason?.failure?.code ?? kind
            failure = `模型调用${kind === 'aborted' ? '被中止' : '失败'}：${detail}`
          }
        }
      }

      if (failure !== undefined) throw new Error(failure)
      if (text.trim() === '') throw new Error('模型返回了空内容')

      return {
        text,
        provider: route.provider,
        model: route.model,
        ...(promptTokens === undefined ? {} : { promptTokens }),
        ...(completionTokens === undefined ? {} : { completionTokens }),
      }
    },
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
