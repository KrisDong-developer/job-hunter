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
import type { DeliveryState } from '../../../shared/contract/enums/job.js'
import type { JobDto } from '../../../shared/contract/dto/job.js'
import type { PageSource } from '../../platform/types.js'
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
  /**
   * 本地简历文件的**绝对路径**；`null` = 走平台内简历（BOSS 求职者网页端只支持这一种）。
   *
   * ⚠️ 这一格**不接受外部输入**：路径由 `runtime/actions.ts` 从 `resume_file.id`
   * 自己查出来（`join(filesDir, path)`）。HTTP 与工具层只收 id ——
   * 让请求体直接给一个绝对路径就是一个"任意路径读文件"的洞
   * （与 `readExportFile` 同一条纪律）。
   */
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
 * 「用了哪版简历」那句话（§4.4.2 要求审批文案含它）。
 *
 * 三段必须都在，因为它们是三件不同的事：**哪一份**、**会不会真的传上去**、
 * 以及**没传的话平台会用什么**。只写一个文件名（上一版写的是绝对路径）会让用户
 * 以为自己传了这一版，而平台上收到的其实是另一版 —— 投递不可逆，这种误解代价最大。
 *
 * 放在这一层是因为**批量预览与单条审批共用同一句话**：两处各写一句必然漂移。
 */
export function resumeVersionTextOf(input: { label: string | null; uploads: boolean }): string {
  if (input.label === null) return '平台内简历（平台侧那一份，本机未登记版本）'
  return input.uploads
    ? `${input.label}（会把这份本地文件传给平台）`
    : `${input.label}（平台只吃它自己那份简历 —— 这份文件不会上传，只作本地登记）`
}

/** 「这个平台现在能不能投」的**只读预检**结果（与岗位无关，只看平台能力与登录态）。 */
export interface ApplicationPlatformBlocker {
  code: 'platform_unsupported' | 'not_logged_in'
  message: string
  hint: string
}

/**
 * 平台层面的预检：适配器实现了 `sendResume` 没有、登录态还在不在。
 *
 * 单条投递、批量预览**共用这一份**（与 `greetingPlatformBlocker` 同一个理由：
 * 写两份判断迟早漂移，而漂移的表现是"预览说能投、点下去才失败"）。
 *
 * 顺序是刻意的：**能力先于登录**。"这个平台压根没接投递"比"你还没登录"更接近事实 ——
 * 登录了也还是一样投不出去。
 */
export function applicationPlatformBlocker(
  deps: { registry: AdapterRegistry; session: SessionService },
  platformId: string,
): ApplicationPlatformBlocker | null {
  const adapter = deps.registry.get(platformId)
  if (adapter === undefined) {
    return {
      code: 'platform_unsupported',
      message: `未注册的平台：${platformId}`,
      hint: '这个平台可能已经从适配器里下线了。',
    }
  }
  if (adapter.actions?.sendResume === undefined) {
    return {
      code: 'platform_unsupported',
      message: `${adapter.displayName} 的适配器还没实现投递动作`,
      hint:
        '不会让你点下去再失败，更不会静默变成"已投递"。' +
        '要留个记录的话，可以用「记录投递」手动记一笔（那一步不碰平台）。',
    }
  }
  const account = deps.session.status(platformId)
  if (!account.loggedIn) {
    return {
      code: 'not_logged_in',
      message: `${adapter.displayName} 未登录`,
      hint: `请先在「平台与登录」里完成 ${platformId} 的登录，再重试。`,
    }
  }
  return null
}

/** 「这条现在能不能投」的**只读预检**结果（岗位 + 平台）。 */
export type ApplicationReadiness =
  | { ok: true; job: JobDto; adapterName: string }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_LOGGED_IN' | 'ADAPTER_BROKEN'; message: string; hint: string }

/**
 * 只读预检：岗位在不在，以及这个平台能不能投（后者走 `applicationPlatformBlocker`）。
 *
 * @param deps 只要这三个依赖，所以不需要页面、也不会产生任何副作用
 */
export function applicationReadinessOf(
  deps: { store: Store; registry: AdapterRegistry; session: SessionService },
  jobId: number,
): ApplicationReadiness {
  const job = deps.store.job.detail(jobId)
  if (job === undefined) {
    return { ok: false, code: 'NOT_FOUND', message: `岗位不存在：${String(jobId)}`, hint: '它可能已被删除。' }
  }
  const platformBlocker = applicationPlatformBlocker(deps, job.platformId)
  if (platformBlocker !== null) {
    return {
      ok: false,
      // 两种预检码映射回投递路径原有的错误码：调用方（单条投递）看到的行为与以前一致
      code: platformBlocker.code === 'not_logged_in' ? 'NOT_LOGGED_IN' : 'ADAPTER_BROKEN',
      message: platformBlocker.message,
      hint: platformBlocker.hint,
    }
  }
  return { ok: true, job, adapterName: deps.registry.get(job.platformId)?.displayName ?? job.platformId }
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
  // 能力与登录态的判据与批量预览**共用一份**（见 `applicationReadinessOf`）。
  // 这里再查一次不是重复：审批期间登录可能已经失效。
  const ready = applicationReadinessOf(deps, input.jobId)
  if (!ready.ok) {
    throw new DomainError(ready.code, ready.message, { hint: ready.hint })
  }
  const job = ready.job

  const sendResume = deps.registry.get(job.platformId)?.actions?.sendResume
  if (sendResume === undefined) {
    // 上面刚查过，这里只是给类型收窄；理论上不可达，所以语气要如实
    throw new DomainError('ADAPTER_BROKEN', `${ready.adapterName} 的适配器还没实现投递动作`)
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
