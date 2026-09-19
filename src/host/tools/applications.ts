/**
 * 投递与面试工具：真的投出去、记一笔投递、推进阶段、面试日程、面试准备包。
 *
 * 危险级：`application_deliver` / `application_send` 是**高危**（会真的对外发东西），
 * `application_update` / `interview_manage` 是**中危**（模型发起时审批），
 * `interview_prep` 是只读。分级不是我们这个文件说了算 —— 由 `runtime` 上那层 guard 判。
 */
import type { ToolDefinition } from '../../shared/dsh.js'
import {
  APPLICATION_CHANNELS,
  APPLICATION_CHANNEL_LABEL,
  APPLICATION_STAGES,
  APPLICATION_STAGE_LABEL,
  INTERVIEW_KINDS,
  INTERVIEW_KIND_LABEL,
  INTERVIEW_STATES,
  INTERVIEW_STATE_LABEL,
  type ApplicationChannel,
  type ApplicationStage,
  type InterviewKind,
  type InterviewState,
} from '../../shared/enums.js'
import type { HostRuntime } from '../runtime.js'
import { DomainError } from '../util/errors.js'
import {
  asString,
  enumStr,
  int,
  positiveId,
  renderText,
  requireData,
  schema,
  str,
  textResult,
  toInt,
  toolDefiner,
} from './kit.js'

export function applicationsTools(runtime: HostRuntime): ToolDefinition[] {
  const tool = toolDefiner(runtime)

  return [
    tool<Record<string, unknown>, { text: string }>({
      name: 'application_deliver',
      description:
        '**投递简历**（高危，必须经用户审批）。与 `application_send`（"记一笔我投了"）不同 —— ' +
        '这条会**真的用适配器把简历发出去**，成功后自动记一笔投递。' +
        '不传 filePath 时用平台内简历（BOSS 求职者网页端只支持这种）；传了本地文件而平台不支持上传时会如实失败。',
      timeoutMs: 6 * 60 * 1000,
      parameters: schema(
        {
          jobId: int('岗位 id'),
          filePath: str('本地简历文件的绝对路径；不填 = 用平台内简历'),
        },
        ['jobId'],
      ),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const id = positiveId(args.jobId, 'jobId')
        const filePath = asString(args['filePath'])

        // 注意：这里**没有** guiConfirmed —— 模型不能自我确认，guard 会走 ctx.approval。
        const result = await runtime.sendApplication({
          jobId: id,
          filePath: filePath ?? null,
          actor: 'model',
        })
        return {
          text:
            `已向「${result.company || result.title}」投递简历` +
            `（${result.platformId}，送达状态 ${result.delivery}，${result.sentAt}）。` +
            (result.detail === undefined ? '' : `\n${result.detail}`),
        }
      },
    }),

    tool<Record<string, unknown>, { text: string; applicationId: number }>({
      name: 'application_send',
      description:
        '记录一次投递（简历发出）。**高危**，必须经用户审批 —— 审批文案会显示岗位、渠道与用了哪版简历。',
      timeoutMs: 3 * 60 * 1000,
      parameters: schema(
        {
          jobId: int('岗位 id'),
          resumeId: int('用了哪一版简历；不传用当前启用版本'),
          resumeFileId: int('用了哪份附件；不传表示用在线简历'),
          channel: enumStr(APPLICATION_CHANNELS, '投递渠道'),
          note: str('备注'),
        },
        ['jobId'],
      ),
      outputSchema: {
        type: 'object',
        properties: { text: { type: 'string' }, applicationId: { type: 'integer' } },
      },
      render: renderText,
      async run(args) {
        requireData(runtime)
        const jobId = positiveId(args.jobId, 'jobId')
        const channel = asString(args['channel'])
        if (channel !== undefined && !(APPLICATION_CHANNELS as readonly string[]).includes(channel)) {
          throw new DomainError('INVALID_INPUT', `不支持的渠道：${channel}`, {
            hint: `合法取值：${APPLICATION_CHANNELS.join(' / ')}`,
          })
        }

        // actor='model' → 高危必然走审批；这里**没有** guiConfirmed（模型不能自我确认）
        const application = await runtime.pipeline().recordApplication({
          jobId,
          actor: 'model',
          ...(typeof args['resumeId'] === 'number' ? { resumeId: args['resumeId'] } : {}),
          ...(typeof args['resumeFileId'] === 'number' ? { resumeFileId: args['resumeFileId'] } : {}),
          ...(channel === undefined ? {} : { channel: channel as ApplicationChannel }),
          ...(asString(args['note']) === undefined ? {} : { note: asString(args['note']) as string }),
        })
        runtime.events().publish('application.created', { id: application.id, jobId })
        return {
          applicationId: application.id,
          text:
            `已记录投递 #${String(application.id)}：${application.companyName ?? ''}「${application.jobTitle ?? ''}」` +
            `（渠道 ${APPLICATION_CHANNEL_LABEL[application.channel]}，简历 #${String(application.resumeId ?? 0)}）。\n` +
            '后面的进展用 application_update 推进；看板在「投递流水线」里。',
        }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'application_update',
      description:
        '推进/修正一条投递的阶段（已投递→已查看→面试中→已面试→Offer/已拒绝/无回复）。' +
        '**中危**：模型发起时需要审批。回退需要显式 allowBackward。',
      parameters: schema(
        {
          applicationId: int('投递记录 id（board 或 job_detail 里能看到）'),
          to: enumStr(APPLICATION_STAGES, '目标阶段'),
          note: str('变更原因（会写进状态事件，便于回溯）'),
          allowBackward: { type: 'boolean', description: '允许回退到更早的阶段' },
          evidenceRef: str('依据（比如消息 id），自动识别时必填'),
        },
        ['applicationId', 'to'],
      ),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const id = positiveId(args.applicationId, 'applicationId')
        const to = asString(args['to'])
        if (to === undefined) throw new DomainError('INVALID_INPUT', 'to 必填')

        return await runtime.guard().run(
          {
            action: 'application.update',
            actor: 'model',
            danger: 'mid',
            payload: { applicationId: id, to, note: asString(args['note']) ?? null },
          },
          async () => {
            const before = runtime.pipeline().get(id)
            const application = runtime.pipeline().advance({
              applicationId: id,
              to: to as ApplicationStage,
              actor: 'model',
              source: 'model',
              ...(typeof args['allowBackward'] === 'boolean' ? { allowBackward: args['allowBackward'] } : {}),
              ...(asString(args['note']) === undefined ? {} : { note: asString(args['note']) as string }),
              ...(asString(args['evidenceRef']) === undefined
                ? {}
                : { evidenceRef: asString(args['evidenceRef']) as string }),
            })
            runtime.events().publish('application.advanced', { id, stage: application.stage })
            return {
              text:
                `投递 #${String(id)}：${APPLICATION_STAGE_LABEL[before.stage]} → ` +
                `${APPLICATION_STAGE_LABEL[application.stage]}（已记入状态事件）。`,
            }
          },
        )
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'interview_manage',
      description:
        '面试日程：新增/改期/改状态/查冲突。**中危**：模型发起时需要审批。' +
        '改期必须显式 allowReschedule。',
      parameters: schema(
        {
          action: enumStr(['list', 'upsert', 'state', 'conflicts'], '要做的操作'),
          interviewId: int('面试 id（state 需要）'),
          applicationId: int('关联的投递 id'),
          jobId: int('关联岗位 id'),
          at: str('面试时间（ISO，如 2026-09-20T14:00:00+08:00）'),
          round: int('第几轮'),
          kind: enumStr(INTERVIEW_KINDS, '面试形式'),
          state: enumStr(INTERVIEW_STATES, '目标状态'),
          place: str('地点（现场面试）'),
          link: str('会议链接（视频面试）'),
          contact: str('联系人'),
          commuteMin: int('单程通勤分钟数（现场面试）'),
          allowReschedule: { type: 'boolean', description: '确认改期' },
          days: int('list 时往后看几天，默认 30'),
        },
        ['action'],
      ),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const action = asString(args['action'])
        const service = runtime.interviews()

        if (action === 'conflicts') {
          const conflicts = service.conflicts()
          return {
            text:
              conflicts.length === 0
                ? '没有面试时间冲突。'
                : ['有面试时间冲突：', ...conflicts.map((item) => `· #${String(item.a)} 与 #${String(item.b)}：${item.reason}（重叠 ${String(item.overlapMin)} 分钟）`)].join('\n'),
          }
        }

        if (action === 'list') {
          const days = toInt(args['days'], 30, 1, 365)
          const now = new Date()
          const list = service.list({
            from: new Date(now.getTime() - 86_400_000).toISOString(),
            to: new Date(now.getTime() + days * 86_400_000).toISOString(),
            limit: 50,
          })
          if (list.length === 0) return { text: `未来 ${String(days)} 天没有面试安排。` }
          return {
            text: [
              `共 ${String(list.length)} 场：`,
              ...list.map(
                (item) =>
                  `#${String(item.id)} ${item.at.slice(0, 16).replace('T', ' ')}｜` +
                  `${item.companyName ?? ''} ${item.jobTitle ?? ''}｜第 ${String(item.round)} 轮｜` +
                  `${INTERVIEW_KIND_LABEL[item.kind]}｜${INTERVIEW_STATE_LABEL[item.state]}` +
                  `${item.conflicts.length === 0 ? '' : ` ⚠ 与 #${item.conflicts.join('、#')} 冲突`}` +
                  `${item.commuteMin === null ? '' : `｜通勤 ${String(item.commuteMin)} 分钟`}`,
              ),
            ].join('\n'),
          }
        }

        if (action === 'state') {
          const id = toInt(args['interviewId'], 0, 1, Number.MAX_SAFE_INTEGER)
          const state = asString(args['state'])
          if (id === 0 || state === undefined) {
            throw new DomainError('INVALID_INPUT', 'state 需要 interviewId 与 state')
          }
          return await runtime.guard().run(
            {
              action: 'interview.state',
              actor: 'model',
              danger: 'mid',
              payload: { interviewId: id, state },
            },
            async () => {
              const interview = service.setState(id, state as InterviewState, {
                ...(args['allowReschedule'] === true ? { allowReschedule: true } : {}),
                source: 'model',
              })
              return {
                text: `面试 #${String(id)} 状态改为「${INTERVIEW_STATE_LABEL[interview.state]}」（已记入状态事件）。`,
              }
            },
          )
        }

        // upsert
        const at = asString(args['at'])
        if (at === undefined) throw new DomainError('INVALID_INPUT', 'at（面试时间）必填')
        return await runtime.guard().run(
          {
            action: 'interview.upsert',
            actor: 'model',
            danger: 'mid',
            ...(typeof args['jobId'] === 'number' ? { target: { jobId: args['jobId'] } } : {}),
            payload: { at, round: args['round'] ?? 1, kind: args['kind'] ?? 'video' },
          },
          async () => {
            const interview = service.upsert({
              at,
              ...(typeof args['interviewId'] === 'number' ? { id: args['interviewId'] } : {}),
              ...(typeof args['applicationId'] === 'number' ? { applicationId: args['applicationId'] } : {}),
              ...(typeof args['jobId'] === 'number' ? { jobId: args['jobId'] } : {}),
              ...(typeof args['round'] === 'number' ? { round: args['round'] } : {}),
              ...(asString(args['kind']) === undefined ? {} : { kind: asString(args['kind']) as InterviewKind }),
              ...(asString(args['place']) === undefined ? {} : { place: asString(args['place']) as string }),
              ...(asString(args['link']) === undefined ? {} : { link: asString(args['link']) as string }),
              ...(asString(args['contact']) === undefined ? {} : { contact: asString(args['contact']) as string }),
              ...(typeof args['commuteMin'] === 'number' ? { commuteMin: args['commuteMin'] } : {}),
            })
            runtime.events().publish('interview.scheduled', { id: interview.id, at: interview.at })
            return {
              text:
                `${String(args['interviewId'] ?? '') === '' ? '已新增' : '已更新'}面试 #${String(interview.id)}：` +
                `${interview.at}｜${INTERVIEW_KIND_LABEL[interview.kind]}｜${INTERVIEW_STATE_LABEL[interview.state]}` +
                `${interview.conflicts.length === 0 ? '' : ` ⚠ 与 #${interview.conflicts.join('、#')} 时间冲突`}`,
            }
          },
        )
      },
    }),

    tool<{ interviewId: number }, { text: string }>({
      name: 'interview_prep',
      description:
        '面试准备包：技能差距、公司风险标注、之前记过的错题、通勤提醒与检查清单。低危，只读。',
      parameters: schema({ interviewId: int('面试 id') }, ['interviewId']),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const id = positiveId(args.interviewId, 'interviewId')
        const prep = runtime.interviews().prep(id)
        const lines = [
          `#${String(prep.interviewId)} ${prep.companyName ?? ''}「${prep.jobTitle ?? ''}」面试准备`,
          '',
          `通勤：${prep.commute.advice}`,
          prep.matchedSkills.length === 0
            ? '技能匹配：岗位文本里没抽到与你简历重合的技术词'
            : `你有的：${prep.matchedSkills.join('、')}`,
          prep.missingSkills.length === 0
            ? ''
            : `你没有的（会被追问）：${prep.missingSkills.slice(0, 10).join('、')}`,
          prep.companyFlags.length === 0 ? '公司风险：规则没有命中' : `公司风险：${prep.companyFlags.join('；')}`,
          prep.questionNotes.length === 0
            ? '错题本：还没有记录'
            : `错题本（问过 ${String(prep.questionNotes[0]?.times ?? 0)} 次以上的排前面）：\n${prep.questionNotes
                .slice(0, 5)
                .map((note) => `  · ${note.question}（${String(note.times)} 次）`)
                .join('\n')}`,
          '',
          '检查清单：',
          ...prep.checklist.map((item) => `· ${item}`),
          ...prep.notes.map((note) => `\n注意：${note}`),
        ]
        return { text: lines.filter((line) => line !== '').join('\n') }
      },
    }),
  ]
}
