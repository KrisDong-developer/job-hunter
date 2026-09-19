/**
 * Offer 工具（§22.2 的 `offer_manage`；H1/H2/H3/H4）。
 *
 * ## 为什么是一个工具而不是七个
 *
 * §22.1 要求"工具数量克制"：offer 的增删改查 + 对比是**同一件事的不同步骤**
 * （登记 → 补条件 → 对比 → 定下来），拆成七个工具只会挤占模型上下文。
 * 与 `interview_manage` / `job_plan_manage` 同一个形状。
 *
 * ## 一处刻意的**不同**于仓储的语义
 *
 * 仓储那边 `comp` 是**整份替换**（与 `criteria` / `resume.content` 一致）。
 * 但工具这一层收的是**扁平参数**（模型逐个填比搓一个嵌套 JSON 可靠得多），
 * 所以这里会先把现值读出来合并再写 —— 否则"把公积金比例补上"会顺手清掉
 * 用户先前填的月 base。这条差异是有意的，也是这一层唯一替调用方做的决定。
 */
import type { ToolDefinition } from '../../shared/contract/dsh.js'
import { OFFER_STATES } from '../../shared/contract/enums/offer.js'
import type { OfferComp } from '../../shared/domain/offer-comp.js'
import { OFFER_COMP_FIELDS, formatMoney } from '../../shared/domain/offer-comp.js'
import type { OfferState } from '../../shared/contract/enums/offer.js'
import type { HostRuntime } from '../runtime.js'
import { DomainError } from '../util/errors.js'
import { asString, enumStr, int, num, positiveId, requireData, schema, str, textResult, toolDefiner } from './kit.js'

/** 模型能填的待遇项（与 `OfferComp` 一一对应，扁平化后逐个当参数）。 */
const COMP_NUMBER_KEYS = [
  'monthlyBase',
  'monthsPerYear',
  'bonusYearly',
  'allowanceYearly',
  'equityValue',
  'socialInsuranceBase',
  'housingFundRatio',
  'housingFundBase',
  'probationMonths',
  'probationRatio',
  'noncompeteMonths',
  'noncompeteComp',
  'annualLeaveDays',
  'commuteMin',
  'relocationCost',
] as const

const COMP_TEXT_KEYS = ['equityNote', 'penaltyNote', 'overtimeNote'] as const

export function offersTools(runtime: HostRuntime): ToolDefinition[] {
  const tool = toolDefiner(runtime)

  return [
    tool<Record<string, unknown>, { text: string }>({
      name: 'offer_manage',
      description:
        'Offer（拿到手之后的报价）：登记 / 改条件 / 改状态 / 并排对比 / 删除。' +
        '**写操作是中危**，模型发起时需要用户审批；`list` / `get` / `compare` 是低危只读。' +
        '对比会逐项列出差异（月 base、年发放月数、公积金比例、试用期比例、竞业补偿…），' +
        '并指出哪些格子还空着 —— 那些必须去问 HR，写进合同才算数。',
      parameters: schema(
        {
          action: enumStr(['list', 'get', 'create', 'update', 'state', 'remove', 'compare'], '要做的操作'),
          offerId: int('offer id（get / update / state / remove 需要）'),
          companyName: str('公司名（公司还没入库时直接填名字即可）'),
          companyId: int('公司 id（公司已在库里时）'),
          jobId: int('关联岗位 id（来自平台内投递的 offer）'),
          role: str('offer 的岗位名；不填会从关联岗位取'),
          deadline: str('答复截止时间（ISO，如 2026-10-08T23:59:00+08:00）'),
          state: enumStr(OFFER_STATES, 'offer 状态'),
          note: str('备注'),
          monthlyBase: num('月 base（元/月）'),
          monthsPerYear: num('年发放月数（12/13/15/16）'),
          bonusYearly: num('年终奖（元/年）'),
          bonusInContract: { type: 'boolean', description: '年终奖是否写进合同（口头承诺与合同条款是两件事）' },
          allowanceYearly: num('补贴与餐补合计（元/年）'),
          equityValue: num('股票期权年化（元/年）'),
          equityNote: str('行权价 / 归属节奏 / 回购条款'),
          socialInsuranceBase: num('社保基数（元/月）'),
          housingFundRatio: num('公积金比例（%，如 12）'),
          housingFundBase: num('公积金基数（元/月）'),
          probationMonths: num('试用期时长（月）'),
          probationRatio: num('试用期工资比例（%，如 80）'),
          noncompeteMonths: num('竞业限制时长（月）'),
          noncompeteComp: num('竞业补偿（元/月）'),
          penaltyNote: str('违约金 / 服务期条款'),
          annualLeaveDays: num('年假（天）'),
          overtimeNote: str('加班与调休'),
          commuteMin: num('单程通勤（分钟）'),
          relocationCost: num('搬家成本（元，一次性）'),
          offerIds: { type: 'array', items: { type: 'integer' }, description: 'compare 要比的 offer id；不填 = 所有还没决定的' },
          useLlm: { type: 'boolean', description: 'compare 是否允许调用模型给建议（false = 只要规则结论）' },
        },
        ['action'],
      ),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const action = asString(args['action'])
        const service = runtime.offers()

        if (action === 'list') {
          const items = service.list({ limit: 50 })
          if (items.length === 0) {
            return { text: '还没有登记任何 offer。拿到报价后用 offer_manage(action="create") 记下来。' }
          }
          return {
            text: [
              `共 ${String(items.length)} 份（未决定 ${String(service.openCount())} 份）：`,
              ...items.map((offer) => {
                const cash = offer.annualCash === null ? '年现金总包未知' : `年现金总包 ${formatMoney(offer.annualCash)}`
                const due =
                  offer.daysLeft === null
                    ? '没有截止时间'
                    : offer.daysLeft < 0
                      ? `**已过期 ${String(Math.abs(offer.daysLeft))} 天**`
                      : `还有 ${String(offer.daysLeft)} 天截止`
                return `#${String(offer.id)} ${offer.companyName}｜${offer.role || '（没填岗位）'}｜${cash}｜${due}｜${offer.state}`
              }),
            ].join('\n'),
          }
        }

        if (action === 'get') {
          const offer = service.get(positiveId(args['offerId'], 'offerId'))
          const lines = [
            `#${String(offer.id)} ${offer.companyName}｜${offer.role || '（没填岗位）'}`,
            `状态：${offer.state}` +
              (offer.deadline === null
                ? '｜没有截止时间'
                : `｜截止 ${offer.deadline.slice(0, 10)}（${offer.daysLeft === null ? '?' : String(offer.daysLeft)} 天）`),
            offer.annualCash === null ? '年现金总包：算不出来（缺月 base 或月数）' : `年现金总包：${formatMoney(offer.annualCash)}`,
            '明细：',
          ]
          let filled = 0
          for (const spec of OFFER_COMP_FIELDS) {
            const value = offer.comp[spec.key]
            if (value === undefined) continue
            filled += 1
            lines.push(`· ${spec.label}：${String(value)}`)
          }
          if (filled === 0) lines.push('· （还什么都没填）')
          if (offer.note !== null) lines.push(`备注：${offer.note}`)
          return { text: lines.join('\n') }
        }

        if (action === 'compare') {
          const rawIds = Array.isArray(args['offerIds']) ? args['offerIds'] : []
          const offerIds = rawIds.filter((value): value is number => typeof value === 'number' && value > 0)
          const result = await service.compare({
            ...(offerIds.length === 0 ? {} : { offerIds }),
            ...(typeof args['useLlm'] === 'boolean' ? { useLlm: args['useLlm'] } : {}),
          })
          const header = result.offers.map((offer, index) => `${String.fromCharCode(65 + index)}=${offer.companyName}`).join(' ')
          const table = result.rows
            .filter((row) => row.differs || row.values.some((value) => value !== null))
            .map((row) => `${row.label}：${row.values.map((value) => value ?? '未填写').join(' ｜ ')}`)
          const lines = [header, '', ...table, '', '结论：', ...result.facts.map((fact) => `· ${fact}`)]
          if (result.advice !== null) {
            lines.push('', '模型建议：', result.advice)
          } else if (result.notes.length > 0) {
            lines.push('', `（没有模型建议：${result.notes.join('；')}）`)
          }
          return { text: lines.join('\n') }
        }

        if (action === 'remove') {
          const id = positiveId(args['offerId'], 'offerId')
          return await runtime.guard().run(
            { action: 'offer.remove', actor: 'model', danger: 'mid', payload: { offerId: id } },
            async () => {
              if (!service.remove(id)) throw new DomainError('NOT_FOUND', `Offer 不存在：${String(id)}`)
              return { text: `已删除 offer #${String(id)}。` }
            },
          )
        }

        if (action === 'state') {
          const id = positiveId(args['offerId'], 'offerId')
          const state = asString(args['state'])
          if (state === undefined) throw new DomainError('INVALID_INPUT', 'state 需要 offerId 与 state')
          return await runtime.guard().run(
            { action: 'offer.state', actor: 'model', danger: 'mid', payload: { offerId: id, state } },
            async () => {
              const offer = service.setState(id, state as OfferState)
              return {
                text:
                  `offer #${String(offer.id)}（${offer.companyName}）状态改为「${offer.state}」。` +
                  (offer.state === 'accepted' ? '\n其余还没决定的 offer 记得也收个尾 —— 别让 HR 干等。' : ''),
              }
            },
          )
        }

        const flat = compOf(args)
        const identity = {
          ...(typeof args['companyId'] === 'number' ? { companyId: args['companyId'] } : {}),
          ...(asString(args['companyName']) === undefined ? {} : { companyName: asString(args['companyName']) as string }),
          ...(typeof args['jobId'] === 'number' ? { jobId: args['jobId'] } : {}),
          ...(asString(args['role']) === undefined ? {} : { role: asString(args['role']) as string }),
          ...(asString(args['deadline']) === undefined ? {} : { deadline: asString(args['deadline']) as string }),
          ...(asString(args['note']) === undefined ? {} : { note: asString(args['note']) as string }),
          ...(asString(args['state']) === undefined ? {} : { state: asString(args['state']) as OfferState }),
        }

        if (action === 'create') {
          return await runtime.guard().run(
            {
              action: 'offer.create',
              actor: 'model',
              danger: 'mid',
              ...(typeof args['jobId'] === 'number' ? { target: { jobId: args['jobId'] } } : {}),
              payload: {
                companyName: identity.companyName ?? '（未填，将取关联岗位的公司）',
                jobId: identity.jobId ?? null,
                compKeys: Object.keys(flat).length,
              },
            },
            async () => {
              const offer = service.create({ ...identity, comp: flat })
              return {
                text:
                  `已登记 offer #${String(offer.id)}：${offer.companyName}｜${offer.role || '（没填岗位）'}` +
                  `${offer.annualCash === null ? '' : `｜年现金总包 ${formatMoney(offer.annualCash)}`}。\n` +
                  '公积金比例、试用期工资比例、竞业补偿这几项最容易漏 —— 没填的话去问 HR，写进合同才算数。',
              }
            },
          )
        }

        if (action === 'update') {
          const id = positiveId(args['offerId'], 'offerId')
          return await runtime.guard().run(
            { action: 'offer.update', actor: 'model', danger: 'mid', payload: { offerId: id, compKeys: Object.keys(flat).length } },
            async () => {
              const current = service.get(id)
              // 仓储是整份替换；工具收的是扁平参数，所以这里先把现值合上（见文件头）
              const offer = service.update(id, {
                ...identity,
                ...(Object.keys(flat).length === 0 ? {} : { comp: { ...current.comp, ...flat } }),
              })
              return {
                text:
                  `已更新 offer #${String(offer.id)}（${offer.companyName}）` +
                  `${offer.annualCash === null ? '' : `，年现金总包 ${formatMoney(offer.annualCash)}`}。`,
              }
            },
          )
        }

        throw new DomainError('INVALID_INPUT', `不认识的操作：${String(action)}`, {
          hint: '合法取值：list / get / create / update / state / remove / compare',
        })
      },
    }),
  ]
}

/** 从扁平参数里收出待遇项。**没给的键不出现** —— 更新时靠这一点保留原值。 */
function compOf(args: Record<string, unknown>): OfferComp {
  const comp: OfferComp = {}
  const target = comp as Record<string, number | string | boolean>
  for (const key of COMP_NUMBER_KEYS) {
    const value = args[key]
    if (typeof value === 'number' && Number.isFinite(value)) target[key] = value
  }
  for (const key of COMP_TEXT_KEYS) {
    const value = asString(args[key])
    if (value !== undefined) target[key] = value
  }
  if (typeof args['bonusInContract'] === 'boolean') target['bonusInContract'] = args['bonusInContract']
  return comp
}
