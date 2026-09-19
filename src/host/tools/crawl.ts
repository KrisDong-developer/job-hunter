/**
 * 抓取执行工具：`crawl_run`（手动抓一次，中危需审批）与 `crawl_status`（健康查询，只读）。
 *
 * 与 `plans.ts` 的分工：方案怎么配是那边的事；这里只负责"现在抓一次"与"现在什么状态"。
 * 真正的抓取一律经 `runtime.crawl` / `runtime.runPlan` —— 工具层不自己开浏览器。
 */
import type { ToolDefinition } from '../../shared/contract/dsh.js'
import { CRAWL_STATE_LABEL, HEALTH_STATE_LABEL } from '../../shared/contract/enums/crawl.js'
import { runReasonLabel } from '../../shared/contract/enums/plan.js'
import { humanizeFailure } from '../../shared/text/error-text.js'
import { formatLocalMoment } from '../../shared/text/time-format.js'
import type { HostRuntime } from '../runtime.js'
import { asString, int, requireData, schema, str, textResult, toolDefiner } from './kit.js'

export function crawlTools(runtime: HostRuntime): ToolDefinition[] {
  const tool = toolDefiner(runtime)

  return [
    tool<Record<string, unknown>, { text: string }>({
      name: 'crawl_run',
      description:
        '手动触发一次抓取（会真的打开浏览器访问招聘站）。模型发起时这是中危操作，需要用户审批。',
      timeoutMs: 5 * 60 * 1000,
      parameters: schema({
        platformId: str('平台 id；不填用第一个已注册平台'),
        keyword: str('搜索关键词'),
        city: str('城市'),
        planId: int('改用某个方案的条件抓取'),
      }),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const platformId = asString(args['platformId'])
        const keyword = asString(args['keyword'])
        const city = asString(args['city'])
        const planId = typeof args['planId'] === 'number' ? args['planId'] : undefined

        // 中危 + 模型发起 → 必然走审批。审批文案要说清"要访问哪个站、抓什么"。
        return await runtime.guard().run(
          {
            action: 'crawl.run',
            actor: 'model',
            danger: 'mid',
            target: { ...(platformId === undefined ? {} : { platformId }) },
            payload: {
              platformId: platformId ?? '第一个已注册平台',
              keyword: keyword ?? '（沿用方案条件）',
              city: city ?? '',
              planId: planId ?? null,
              note: '这次动作会真实打开招聘网站页面。',
            },
          },
          async () => {
            const summary =
              planId === undefined
                ? await runtime.crawl({
                    platformId: platformId ?? runtime.registry().list()[0]?.id ?? '',
                    criteria: {
                      ...(keyword === undefined ? {} : { keyword }),
                      ...(city === undefined ? {} : { city }),
                    },
                  })
                : await runtime.runPlan(planId, 'manual')
            return {
              text:
                `抓取完成（${summary.run.platformId}）：发现 ${String(summary.run.found)} 条，` +
                `新增 ${String(summary.run.inserted)}、更新 ${String(summary.run.updated)}` +
                (summary.quarantined > 0 ? `，隔离 ${String(summary.quarantined)} 条` : '') +
                '。',
            }
          },
        )
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'crawl_status',
      description: '抓取/适配器/登录态健康查询：在跑什么、哪个平台不健康、调度下次什么时候跑。',
      parameters: schema({}),
      ...textResult,
      async run() {
        const status = runtime.crawlStatus()
        const scheduler = runtime.schedulerStatus()
        const platforms = runtime.platforms()
        const now = new Date()
        // 调度归属只说一句话：/「未运行」+「下次还有 9 小时」并排会让模型转述出互相矛盾的话
        const owner = scheduler.paused
          ? '定时已暂停（手动仍可用）'
          : scheduler.readOnly
            ? `由另一个实例负责（本实例只读：${scheduler.readOnlyReason ?? '原因未知'}）`
            : scheduler.scheduling
              ? '本实例负责'
              : '未启动（数据层可能还没就绪）'
        const skipNotes = scheduler.planStatus
          .filter((item) => item.lastDecision?.decision === 'skipped')
          .map(
            (item) =>
              `· ${item.name}：${item.lastDecision?.message ?? item.lastDecision?.reason ?? '原因未知'}`,
          )
        const lines = [
          `抓取：${status.busy ? '正在跑' : '空闲'}`,
          `调度：${owner}` +
            `${scheduler.nextRunAt === null ? '' : `，下次 ${formatLocalMoment(scheduler.nextRunAt, now) ?? ''}`}` +
            `${scheduler.planStatus.length === 0 ? '' : `｜新鲜度 ${scheduler.planStatus.map((item) => `${item.name} ${item.freshness.level}`).join('、')}`}`,
          `租约：${scheduler.lease.held ? `本实例持有（进程 ${String(scheduler.lease.pid ?? '?')}）` : `另一个实例持有（进程 ${String(scheduler.lease.pid ?? '?')}）`}`,
          ...(skipNotes.length === 0 ? [] : ['上次到点没跑：', ...skipNotes]),
          '平台：',
          ...platforms.map(
            (platform) =>
              `· ${platform.displayName}｜健康 ${HEALTH_STATE_LABEL[platform.health]}｜` +
              `${platform.account.loggedIn ? '已登录' : '未登录'}｜` +
              `${platform.account.hiddenFromCurrentEmployer === true ? '已设隐身' : '隐身未确认'}` +
              `${platform.healthReason === null ? '' : `｜${platform.healthReason}`}`,
          ),
          ...(status.recentRuns.length === 0
            ? ['最近抓取：还没有记录']
            : [
                '最近抓取：',
                ...status.recentRuns.slice(0, 5).map((run) => {
                  const reason = runReasonLabel(run.reason)
                  // 失败原因转成人话：模型转述一串堆栈对用户毫无帮助
                  const failure = humanizeFailure(run.errorCode, run.errorMsg)
                  return (
                    `· ${formatLocalMoment(run.startedAt, now) ?? run.startedAt}` +
                    `${reason === null ? '' : `（${reason}）`} ${run.platformId} ` +
                    `${CRAWL_STATE_LABEL[run.state]}｜发现 ${String(run.found)} ` +
                    `新增 ${String(run.inserted)} 更新 ${String(run.updated)}` +
                    `${failure === null ? '' : `｜${failure.short}`}`
                  )
                }),
              ]),
        ]
        return { text: lines.join('\n') }
      },
    }),
  ]
}
