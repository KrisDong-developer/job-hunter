/**
 * 低危动作实现：**探测某岗位在平台上的接触阶段**。
 *
 * 为什么也算"经闸门"：它是低危（只看不发，一个字节都不往外写），但它会**开一个真实
 * 浏览器页面访问招聘站** —— 与 `inbox.sync` 同一条理由：凡是要动浏览器的事，统一从
 * 闸门过（离线闸门、风控暂停、额度、冷却都在那边），而不是各个入口自己判断。
 *
 * ## 一条硬规则：**探测 ≠ 改状态**
 *
 * §4.3 的硬规则用在消息上（识别邀约不改状态），这里同理：平台说"HR 已读"，
 * 不等于我们本地那条接触态就该被改。规则识别会误判，而状态被误改之后用户会漏掉
 * 一个真正在推进的岗位。所以本动作**只返回平台事实**（`stage`），一个字段都不写库；
 * 要不要据此推进接触态，是用户的下一次显式动作。
 */
import type { AdapterRegistry } from '../../platform/registry.js'
import type { SessionService } from '../../platform/session.js'
import type { PageSource } from '../../platform/types.js'
import type { ContactStage } from '../../../shared/enums.js'
import { CONTACT_STAGE_LABEL } from '../../../shared/enums.js'
import type { Store } from '../../store/store.js'
import { DomainError, messageOf } from '../../util/errors.js'
import { systemClock, type Clock } from '../../util/time.js'
import { guardAuthority, type GuardToken } from '../token.js'

export const STAGE_PROBE_ACTION = 'contact.stage'

export interface StageProbeDeps {
  store: Store
  registry: AdapterRegistry
  session: SessionService
  pageSource: PageSource
  clock?: Clock
  logger?: { info(message: string): void; warn(message: string): void }
}

export interface StageProbeInput {
  jobId: number
}

export interface StageProbeResult {
  jobId: number
  platformId: string
  /**
   * 平台上的事实。
   *
   * `null` = **判不出来**（会话不在列表里，或状态标记认不出来）—— 契约允许，
   * 而且这里绝不拿 `none` 顶上：「从没打过招呼」与「会话被平台移出保留窗口」
   * 是两件不同的事，猜一个会让用户在错误的岗位上下判断。
   */
  stage: ContactStage | null
  /** 给人看的一句说明（含"没有改动任何本地状态"这件事）。 */
  note: string
  checkedAt: string
}

/**
 * 探测一个岗位当前的接触阶段。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌；缺参编译不过，伪造则运行期拒绝
 */
export async function probeContactStage(
  deps: StageProbeDeps,
  guardToken: GuardToken,
  input: StageProbeInput,
): Promise<StageProbeResult> {
  // ── 第一行：机制化强制 ────────────────────────────────────────────
  guardAuthority.assert(guardToken, STAGE_PROBE_ACTION)

  const clock = deps.clock ?? systemClock
  const job = deps.store.job.detail(input.jobId)
  if (job === undefined) {
    throw new DomainError('NOT_FOUND', `岗位不存在：${String(input.jobId)}`, {
      detail: { jobId: input.jobId },
    })
  }

  const adapter = deps.registry.get(job.platformId)
  if (adapter === undefined) {
    throw new DomainError('NOT_FOUND', `未注册的平台：${job.platformId}`)
  }

  const account = deps.session.status(job.platformId)
  if (!account.loggedIn) {
    throw new DomainError('NOT_LOGGED_IN', `${adapter.displayName} 未登录`, {
      hint: `请先在「平台与登录」里完成 ${job.platformId} 的登录，再重试。`,
      detail: { platformId: job.platformId },
    })
  }

  const detect = adapter.actions?.detectStage
  if (detect === undefined) {
    // 说实话：没实现就说没实现，别返回一个"看起来像 none"的东西
    throw new DomainError('ADAPTER_BROKEN', `${adapter.displayName} 的适配器还没实现"探测接触阶段"`, {
      hint: '目前只有 zhipin 实现了它。在此之前不要据此改动接触态。',
      detail: { platformId: job.platformId, action: STAGE_PROBE_ACTION },
    })
  }

  const page = await deps.pageSource.acquire()
  try {
    const stage = await detect(page, {
      title: job.title,
      company: job.companyName ?? '',
      sourceUrl: job.sourceUrl,
    })
    deps.logger?.info(
      `[guard] 探测接触阶段：岗位 #${String(job.id)}（${job.platformId}）→ ${stage ?? '判不出来'}`,
    )
    return {
      jobId: job.id,
      platformId: job.platformId,
      stage,
      note:
        stage === null
          ? '平台侧判不出这个岗位的阶段：会话可能不在列表里（从没打过招呼，或已被平台移出保留窗口），' +
            '也可能状态标记认不出来 —— 这两种情况不敢猜，所以不给结论。**没有改动任何本地状态。**'
          : `平台侧看到的是「${CONTACT_STAGE_LABEL[stage]}」。**没有改动任何本地状态** —— 要不要推进接触态由你显式确认。`,
      checkedAt: clock(),
    }
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DomainError('INTERNAL', `探测接触阶段失败：${messageOf(error)}`)
  } finally {
    await deps.pageSource.release(page).catch(() => undefined)
  }
}
