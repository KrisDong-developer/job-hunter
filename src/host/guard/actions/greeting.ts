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
import type { DeliveryState, PageSource } from '../../platform/types.js'
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
  const job = deps.store.job.detail(input.jobId)
  if (job === undefined) {
    throw new DomainError('NOT_FOUND', `岗位不存在：${String(input.jobId)}`)
  }

  const adapter = deps.registry.get(job.platformId)
  if (adapter === undefined) {
    throw new DomainError('NOT_FOUND', `未注册的平台：${job.platformId}`)
  }

  // 二次确认登录态：审批期间登录可能已经失效
  const account = deps.session.status(job.platformId)
  if (!account.loggedIn) {
    throw new DomainError('NOT_LOGGED_IN', `${adapter.displayName} 未登录`, {
      hint: `请先在「平台与登录」里完成 ${job.platformId} 的登录，再重试。`,
      detail: { platformId: job.platformId },
    })
  }

  const sayHello = adapter.actions?.sayHello
  if (sayHello === undefined) {
    // 诚实地说"还没做"，而不是假装成功 —— 这是 P8「失败必须可见」的直接体现
    throw new DomainError('ADAPTER_BROKEN', `${adapter.displayName} 的适配器还没实现打招呼动作`, {
      hint:
        '目前只有 job/greeting_draft 这类低危能力可用；真正发送需要在适配器里实现 chat 流程。' +
        '在此之前发送一律失败，不会静默变成"已发送"。',
      detail: { platformId: job.platformId, action: GREETING_SEND_ACTION },
    })
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
