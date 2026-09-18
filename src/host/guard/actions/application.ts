/**
 * 危险动作实现：**投递简历**（`application.send` 的平台侧执行）。
 *
 * ⚠️ 这个文件**不在 domain 的公开面上**（§4.4.1 能力不外露）：
 * 真正"把简历发出去"这件事只能经 `guard.run()` 拿到令牌后走到这里。
 * 首行就是令牌校验 —— 直接调用必然抛 `GUARD_DENIED`。
 *
 * 与 `pipeline.recordApplication` 的分工：
 *   * `recordApplication` = 用户说"我把简历投了"，记一笔（本身也过闸门）；
 *   * 本文件 = **适配器真的把简历发出去了**，然后由 `record` 回调落库。
 *     两件事都叫"投递"，但一件是记账，一件是对外发东西。
 *
 * `delivery` 是这条动作里唯一不能猜的东西：适配器没说 `delivered` 就不算发出去了，
 * 失败时把 `delivery` / `evidence` 原样带进错误 detail，让上层能如实转述。
 */
import type { AdapterRegistry } from '../../platform/registry.js'
import type { SessionService } from '../../platform/session.js'
import type { DeliveryState, PageSource } from '../../platform/types.js'
import type { Store } from '../../store/store.js'
import { DomainError, messageOf } from '../../util/errors.js'
import { systemClock, type Clock } from '../../util/time.js'
import { guardAuthority, type GuardToken } from '../token.js'

export const APPLICATION_SEND_ACTION = 'application.send'

export interface ApplicationSendDeps {
  store: Store
  registry: AdapterRegistry
  session: SessionService
  pageSource: PageSource
  clock?: Clock
  logger?: { info(message: string): void; warn(message: string): void }
  /**
   * 投递**成功之后**记一笔（P7）。
   *
   * 与 `greeting.ts` 的 `record` 同一分工：这条动作的职责是"把简历发出去"，
   * 落库口径属于 pipeline 的语义。必须发生在**成功之后** —— 发失败了也记一条"已投递"，
   * 看板从第一天开始就说谎。
   */
  record?: (input: {
    jobId: number
    platformId: string
    actor: string
    filePath: string | null
    delivery: DeliveryState
  }) => void
}

export interface ApplicationSendInput {
  jobId: number
  /** 本地简历文件（绝对路径）；`null` = 走平台内简历（BOSS 求职者网页端只支持这一种）。 */
  filePath: string | null
}

export interface ApplicationSendResult {
  jobId: number
  platformId: string
  company: string
  title: string
  sentAt: string
  delivery: DeliveryState
  /** 适配器给的可读说明（例如"平台只支持平台内简历"）。 */
  detail?: string
}

/**
 * 投递简历（平台侧执行）。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌；缺参编译不过，伪造则运行期拒绝
 */
export async function sendApplication(
  deps: ApplicationSendDeps,
  guardToken: GuardToken,
  input: ApplicationSendInput,
): Promise<ApplicationSendResult> {
  // ── 第一行：机制化强制 ────────────────────────────────────────────
  guardAuthority.assert(guardToken, APPLICATION_SEND_ACTION)

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

  const sendResume = adapter.actions?.sendResume
  if (sendResume === undefined) {
    // 诚实地说"还没做"，而不是假装投出去了（P8「失败必须可见」）
    throw new DomainError('ADAPTER_BROKEN', `${adapter.displayName} 的适配器还没实现投递动作`, {
      hint:
        '目前只有 zhipin 实现了投递；在此之前投递一律失败，不会静默变成"已投递"。' +
        '也可以先用「记录投递」手动记一笔。',
      detail: { platformId: job.platformId, action: APPLICATION_SEND_ACTION },
    })
  }

  const page = await deps.pageSource.acquire()
  try {
    const result = await sendResume(
      page,
      { title: job.title, company: job.companyName ?? '', sourceUrl: job.sourceUrl },
      input.filePath,
    )
    if (!result.ok) {
      // ⚠️ 不抛"已投递"：把适配器给的 delivery / evidence 原样带上，让上层如实转述
      throw new DomainError('INTERNAL', result.message ?? '投递失败', {
        hint:
          result.delivery === 'pending'
            ? '动作看起来已经发出，但没能确认送达 —— 请去平台上核对，不要立刻重试（可能重复投递）。'
            : '平台侧没有完成投递。先确认页面上发生了什么，不要立刻重试。',
        detail: {
          platformId: job.platformId,
          delivery: result.delivery,
          evidence: result.evidence,
        },
      })
    }

    deps.logger?.info(
      `[guard] 已向「${job.companyName ?? job.title}」投递简历（delivery=${result.delivery}）`,
    )
    // 记账放成功之后；记账失败不能反过来说"投递失败" —— 简历确实发出去了
    try {
      deps.record?.({
        jobId: job.id,
        platformId: job.platformId,
        actor: guardToken.actor,
        filePath: input.filePath,
        delivery: result.delivery,
      })
    } catch (error) {
      deps.logger?.warn(`[guard] 简历已投出，但投递记录写入失败：${messageOf(error)}`)
    }
    return {
      jobId: job.id,
      platformId: job.platformId,
      company: job.companyName ?? '',
      title: job.title,
      sentAt: clock(),
      delivery: result.delivery,
      ...(result.message === undefined ? {} : { detail: result.message }),
    }
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DomainError('INTERNAL', `投递失败：${messageOf(error)}`)
  } finally {
    await deps.pageSource.release(page).catch(() => undefined)
  }
}
