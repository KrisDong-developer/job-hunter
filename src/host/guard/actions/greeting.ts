/**
 * 危险动作实现：**发送打招呼**。
 *
 * ⚠️ 这个文件**不在 domain 的公开面上**（§4.4.1 能力不外露）：
 * domain 只暴露安全的读与准备方法（`greeting_draft` 生成文本但不发送），
 * 真正的发送只能经 `guard.run()` 拿到令牌后走到这里。
 *
 * 首行就是令牌校验 —— 直接调用必然抛 `GUARD_DENIED`。
 */
import type { AdapterRegistry } from '../../platform/registry.js'
import type { SessionService } from '../../platform/session.js'
import type { DeliveryState } from '../../../shared/contract/enums/job.js'
import type { PageSource } from '../../platform/types.js'
import type { JobDto } from '../../../shared/contract/dto/job.js'
import type { Store } from '../../store/store.js'
import { DomainError, messageOf } from '../../util/errors.js'
import { systemClock, type Clock } from '../../util/time.js'
import { guardAuthority, type GuardToken } from '../token.js'

export const GREETING_SEND_ACTION = 'greeting.send'

export interface GreetingSendDeps {
  store: Store
  registry: AdapterRegistry
  session: SessionService
  pageSource: PageSource
  clock?: Clock
  logger?: { info(message: string): void; warn(message: string): void }
  /**
   * 发送**成功之后**记一笔接触记录（P7）。
   *
   * 为什么留成回调而不是在这里直接写库：这条动作的职责是"把消息发出去"，
   * "接触态怎么记"属于 `pipeline` 的语义。
   * 更实际的原因是它必须发生在**成功后** —— 发失败了也记一条"已打招呼"，
   * 状态机就从第一天开始说谎。
   */
  record?: (input: {
    jobId: number
    platformId: string
    content: string
    actor: string
    templateId?: number | null
    /**
     * 送达状态，原样交给上层。
     *
     * 为什么要传：`delivered` 是「已打招呼」与「已送达」两态的分界（§12.2），
     * 而"未读超时"的跟进建议只在 `delivered` 上成立 —— 上层据此决定记哪一态。
     * 这一层不自己判断（判断口径属于 pipeline 的语义），只如实转交。
     */
    delivery: DeliveryState
  }) => void
}

export interface GreetingSendInput {
  jobId: number
  /** 话术全文。**不进审计表**（审计只留长度与摘要）。 */
  text: string
}

export interface GreetingSendResult {
  jobId: number
  platformId: string
  company: string
  title: string
  sentAt: string
  textLength: number
}

/** 「这个平台现在能不能发」的**只读预检**结果（与岗位无关，只看平台能力与登录态）。 */
export interface GreetingPlatformBlocker {
  code: 'platform_unsupported' | 'not_logged_in'
  message: string
  hint: string
}

/**
 * 平台层面的预检：适配器实现了 `sayHello` 没有、登录态还在不在。
 *
 * 单条发送、批量预览**共用这一份**：批量预览如果自己再写一套"能不能发"的判断，
 * 两份迟早会漂移 —— 而漂移的表现恰恰是预览说能发、点下去才失败，那比没有预览更恼火。
 *
 * 顺序是刻意的：**能力先于登录**。"这个平台压根不支持打招呼"比"你还没登录"更接近事实 ——
 * 登录了也还是一样发不出去，先说后者会让人白登录一次。
 */
export function greetingPlatformBlocker(
  deps: { registry: AdapterRegistry; session: SessionService },
  platformId: string,
): GreetingPlatformBlocker | null {
  const adapter = deps.registry.get(platformId)
  if (adapter === undefined) {
    return {
      code: 'platform_unsupported',
      message: `未注册的平台：${platformId}`,
      hint: '这个平台可能已经从适配器里下线了。',
    }
  }
  if (adapter.actions?.sayHello === undefined) {
    return {
      code: 'platform_unsupported',
      message: `${adapter.displayName} 的适配器还没实现打招呼动作`,
      hint:
        '平台自身没有稳定的"发起聊天"入口契约，所以这里如实标成发不出去 —— ' +
        '不会让你点下去再失败（更不会静默变成"已发送"）。',
    }
  }
  const account = deps.session.status(platformId)
  if (!account.loggedIn) {
    return {
      code: 'not_logged_in',
      message: `${adapter.displayName} 未登录`,
      hint: `请先在「平台与登录」里完成 ${platformId} 的登录。`,
    }
  }
  return null
}

/** 「这条现在能不能发」的**只读预检**结果（岗位 + 平台）。 */
export type GreetingReadiness =
  | { ok: true; job: JobDto; adapterName: string }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_LOGGED_IN' | 'ADAPTER_BROKEN'; message: string; hint: string }

/**
 * 只读预检：岗位在不在，以及这个平台能不能发（后者走 `greetingPlatformBlocker`）。
 *
 * @param deps 只要这三个依赖，所以不需要页面、也不会产生任何副作用
 */
export function greetingReadinessOf(
  deps: { store: Store; registry: AdapterRegistry; session: SessionService },
  jobId: number,
): GreetingReadiness {
  const job = deps.store.job.detail(jobId)
  if (job === undefined) {
    return { ok: false, code: 'NOT_FOUND', message: `岗位不存在：${String(jobId)}`, hint: '它可能已被删除。' }
  }
  const platformBlocker = greetingPlatformBlocker(deps, job.platformId)
  if (platformBlocker !== null) {
    return {
      ok: false,
      // 两种预检码映射回发送路径原有的错误码：调用方（单条发送）看到的行为与以前一致
      code: platformBlocker.code === 'not_logged_in' ? 'NOT_LOGGED_IN' : 'ADAPTER_BROKEN',
      message: platformBlocker.message,
      hint: platformBlocker.hint,
    }
  }
  return { ok: true, job, adapterName: deps.registry.get(job.platformId)?.displayName ?? job.platformId }
}

/**
 * 发送打招呼。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌；缺参编译不过，伪造则运行期拒绝
 */
export async function sendGreeting(
  deps: GreetingSendDeps,
  guardToken: GuardToken,
  input: GreetingSendInput,
): Promise<GreetingSendResult> {
  // ── 第一行：机制化强制 ────────────────────────────────────────────
  guardAuthority.assert(guardToken, GREETING_SEND_ACTION)

  const clock = deps.clock ?? systemClock
  // 能力与登录态的判据与批量预览**共用一份**（见 `greetingReadinessOf`）。
  // 这里再查一次不是重复：审批期间登录可能已经失效。
  const ready = greetingReadinessOf(deps, input.jobId)
  if (!ready.ok) {
    throw new DomainError(ready.code, ready.message, { hint: ready.hint })
  }
  const job = ready.job
  const sayHello = deps.registry.get(job.platformId)?.actions?.sayHello
  if (sayHello === undefined) {
    // 上面刚查过，这里只是给类型收窄；理论上不可达，所以语气要如实
    throw new DomainError('ADAPTER_BROKEN', `${ready.adapterName} 的适配器还没实现打招呼动作`)
  }

  const page = await deps.pageSource.acquire()
  try {
    const result = await sayHello(
      page,
      { title: job.title, company: job.companyName ?? '', sourceUrl: job.sourceUrl },
      input.text,
    )
    if (!result.ok) {
      throw new DomainError('INTERNAL', result.message ?? '发送打招呼失败', {
        hint: '平台返回了失败。不要立刻重试 —— 先确认页面上发生了什么。',
      })
    }
    deps.logger?.info(`[guard] 已向「${job.companyName ?? job.title}」发送打招呼（未记录正文）`)
    // 记账放在**发送成功之后**：失败也记"已打招呼"会让状态机从第一天起就说谎。
    // 记账本身失败不能反过来说"发送失败" —— 消息确实发出去了，所以只告警。
    try {
      deps.record?.({
        jobId: job.id,
        platformId: job.platformId,
        content: input.text,
        actor: guardToken.actor,
        delivery: result.delivery,
      })
    } catch (error) {
      deps.logger?.warn(`[guard] 打招呼已发出，但接触记录写入失败：${messageOf(error)}`)
    }
    return {
      jobId: job.id,
      platformId: job.platformId,
      company: job.companyName ?? '',
      title: job.title,
      sentAt: clock(),
      // 审计与返回值都只留长度，不留正文
      textLength: input.text.length,
    }
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DomainError('INTERNAL', `发送打招呼失败：${messageOf(error)}`)
  } finally {
    await deps.pageSource.release(page).catch(() => undefined)
  }
}
