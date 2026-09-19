/**
 * 配置工具：读/写插件配置（模型用途开关、发送分层）。
 *
 * ⚠️ 这个工具的**禁止项**比允许项更重要（§22.4）：审计开关、审批开关、额度与冷却期
 * 模型一律不能改。真正拦住的不是这里 —— 是 `runtime.updateSettings` 背后的 guard；
 * 这里只是把"能改什么、不能改什么"如实念给模型听（配置里本来就有这两份清单）。
 */
import type { ToolDefinition } from '../../shared/dsh.js'
import type { HostRuntime } from '../runtime.js'
import type { SettingsSnapshot } from '../settings.js'
import { DomainError } from '../util/errors.js'
import { asString, enumStr, requireData, schema, textResult, toolDefiner } from './kit.js'

export function settingsTools(runtime: HostRuntime): ToolDefinition[] {
  const tool = toolDefiner(runtime)

  return [
    tool<Record<string, unknown>, { text: string }>({
      name: 'job_settings',
      description:
        '读写插件配置：模型用途开关、发送分层（L3 打招呼 / L4 投递 / L4 回复）。' +
        '审计开关、审批开关、额度与冷却期**模型一律不能改**（§22.4 禁止项，会被直接拒绝）。',
      parameters: schema(
        {
          action: enumStr(['get', 'set'], '读还是写'),
          ai: {
            type: 'object',
            description: '模型配置：{ enabled, purposes: { greeting_draft: true, ... } }',
          },
          guard: {
            type: 'object',
            description: '闸门配置：{ levels: { l3Greeting, l4Application, l4Reply } }',
          },
        },
        ['action'],
      ),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const action = asString(args['action'])

        const render = (snapshot: SettingsSnapshot): string =>
          [
            '模型用途：',
            ...snapshot.derived.purposes.map(
              (purpose) => `· ${purpose.label}（${purpose.purpose}）：${purpose.enabled ? '开' : '关'}`,
            ),
            `总开关：${snapshot.ai.enabled ? '开' : '关'}`,
            '发送分层：',
            `· L3 打招呼：${snapshot.guard.levels.l3Greeting ? '开' : '关'}`,
            `· L4 投递：${snapshot.guard.levels.l4Application ? '开' : '关'}`,
            `· L4 回复：${snapshot.guard.levels.l4Reply ? '开' : '关'}`,
            `每日额度：打招呼 ${String(snapshot.guard.dailyLimits.greeting)} / 投递 ${String(
              snapshot.guard.dailyLimits.application,
            )} / 回复 ${String(snapshot.guard.dailyLimits.reply)}`,
            `冷却期：${String(snapshot.guard.cooldownMinutes)} 分钟｜批量上限：${String(
              snapshot.guard.batchLimit,
            )}`,
            `审批：${snapshot.guard.requireApproval ? '必须' : '已关闭'}｜审计：${
              snapshot.guard.auditEnabled ? '开' : '已关闭'
            }`,
            `模型可改：${snapshot.derived.modelEditable.join('、')}`,
            `模型禁止改：${snapshot.derived.modelForbidden.join('、')}`,
          ].join('\n')

        const settings = runtime.settings()
        if (action === 'get') return { text: render(settings.snapshot()) }
        if (action !== 'set') {
          throw new DomainError('INVALID_INPUT', `不认识的 action：${String(action)}`, {
            hint: '合法取值：get / set',
          })
        }

        const ai =
          args['ai'] !== null && typeof args['ai'] === 'object'
            ? (args['ai'] as Record<string, unknown>)
            : undefined
        const guard =
          args['guard'] !== null && typeof args['guard'] === 'object'
            ? (args['guard'] as Record<string, unknown>)
            : undefined
        if (ai === undefined && guard === undefined) {
          throw new DomainError('INVALID_INPUT', 'set 需要至少给出 ai 或 guard')
        }

        const next = await runtime.updateSettings(
          {
            ...(ai === undefined ? {} : { ai: ai as never }),
            ...(guard === undefined ? {} : { guard: guard as never }),
          },
          'model',
        )
        return { text: `配置已更新。\n${render(next)}` }
      },
    }),
  ]
}
