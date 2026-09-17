/**
 * 内置词表（§4.10.3）。
 *
 * **纯规则、不走 LLM**：命中即产出解释与权重。词表以 DB 为权威（ADR-19），
 * 这里只是首次播种的默认值 —— 用户可以在界面上加自己的词，播种不会覆盖已存在的词。
 *
 * `meaning` 是给用户看的**解释**，不是给模型看的提示词：它要能直接回答
 * 「为什么这条被标了」。
 */
import type { DictionarySeedEntry } from '../store/repo/dictionary.js'

export const DICTIONARY_SEED: readonly DictionarySeedEntry[] = [
  // ── 黑话：JD 里的委婉说法 → 实际含义 ──────────────────────────────
  { kind: 'jargon', term: '抗压能力强', meaning: '通常意味着加班多、KPI 压力大', weight: 1.5 },
  { kind: 'jargon', term: '能吃苦', meaning: '常与高强度加班或低于市场的薪资并存', weight: 1.5 },
  { kind: 'jargon', term: '弹性工作', meaning: '往往指没有固定下班时间，而不是自由安排', weight: 1.5 },
  { kind: 'jargon', term: '有激情', meaning: '常见于强调加班文化的描述', weight: 1 },
  { kind: 'jargon', term: '狼性文化', meaning: '高压、强竞争、长期加班的委婉说法', weight: 2 },
  { kind: 'jargon', term: '扁平化管理', meaning: '常意味着缺少明确的层级与晋升路径', weight: 1 },
  { kind: 'jargon', term: '团队年轻', meaning: '常伴随人员流动率高', weight: 1 },
  { kind: 'jargon', term: '高速成长', meaning: '常意味着流程未定型、职责边界模糊', weight: 1 },
  { kind: 'jargon', term: '拥抱变化', meaning: '常意味着方向频繁调整、需求反复', weight: 1.2 },
  { kind: 'jargon', term: '一人多岗', meaning: '职责不清，实际工作范围可能远超岗位名', weight: 1.5 },
  { kind: 'jargon', term: '多面手', meaning: '常见于职责不清或人力不足的团队', weight: 1 },
  { kind: 'jargon', term: '结果导向', meaning: '通常指只看考核指标，过程与工时不被体谅', weight: 1 },
  { kind: 'jargon', term: 'on call', meaning: '需要随时响应，可能包含夜间值班', weight: 1.2 },

  // ── 外包 / 派遣信号 ────────────────────────────────────────────────
  { kind: 'outsourcing', term: '外包', meaning: '外包岗位', weight: 3 },
  { kind: 'outsourcing', term: '人力外包', meaning: '人力外包岗位', weight: 3 },
  { kind: 'outsourcing', term: '服务外包', meaning: '服务外包岗位', weight: 3 },
  { kind: 'outsourcing', term: '劳务派遣', meaning: '劳务派遣，劳动关系在第三方', weight: 3 },
  { kind: 'outsourcing', term: '派遣', meaning: '派遣岗位，劳动关系可能在第三方', weight: 2 },
  { kind: 'outsourcing', term: '驻场', meaning: '驻场开发，通常不是甲方正式编制', weight: 2.5 },
  { kind: 'outsourcing', term: '项目制', meaning: '项目制用工，项目结束即结束', weight: 1.5 },
  { kind: 'outsourcing', term: '乙方', meaning: '乙方交付岗位', weight: 1.5 },
  { kind: 'outsourcing', term: '甲方现场', meaning: '在客户现场工作，多为外包形态', weight: 2 },
  { kind: 'outsourcing', term: '第三方签订', meaning: '劳动合同与实际工作单位不一致', weight: 2.5 },
  { kind: 'outsourcing', term: '与第三方', meaning: '劳动合同主体可能是第三方', weight: 2 },

  // ── 诈骗 / 高风险信号 ──────────────────────────────────────────────
  { kind: 'fraud', term: '押金', meaning: '任何形式的押金都是高风险信号', weight: 4 },
  { kind: 'fraud', term: '保证金', meaning: '收取保证金属于高风险信号', weight: 4 },
  { kind: 'fraud', term: '培训费', meaning: '入职前收费属高风险信号', weight: 4 },
  { kind: 'fraud', term: '日结', meaning: '日结常见于非正规用工', weight: 2.5 },
  { kind: 'fraud', term: '高薪日结', meaning: '典型的高风险招聘话术', weight: 4 },
  { kind: 'fraud', term: '无经验可做', meaning: '与高薪并存的「无门槛」话术', weight: 2.5 },
  { kind: 'fraud', term: '无需经验', meaning: '与高薪并存的「无门槛」话术', weight: 2 },
  { kind: 'fraud', term: '当天入职', meaning: '跳过正常流程，常见于高风险招聘', weight: 2 },
  { kind: 'fraud', term: '包吃包住', meaning: '常与低薪或非正规用工并存，需核实', weight: 1 },
  { kind: 'fraud', term: '年龄不限', meaning: '门槛异常宽松，需核实岗位真实性', weight: 1.5 },
  { kind: 'fraud', term: '男女不限', meaning: '门槛异常宽松，需核实岗位真实性', weight: 1 },

  // ── 僵尸岗位信号（配合统计规则使用）────────────────────────────────
  { kind: 'zombie', term: '长期招聘', meaning: '长期挂着的岗位，可能并不真的在招', weight: 2 },
  { kind: 'zombie', term: '常年招聘', meaning: '长期挂着的岗位，可能并不真的在招', weight: 2 },
  { kind: 'zombie', term: '大量招聘', meaning: '批量挂岗，需核实真实性', weight: 1.5 },
  { kind: 'zombie', term: '招聘若干', meaning: '批量挂岗，需核实真实性', weight: 1 },

  // ── 薪资虚标信号 ──────────────────────────────────────────────────
  { kind: 'salary', term: '上不封顶', meaning: '提成类话术，标称上限通常不可实现', weight: 2.5 },
  { kind: 'salary', term: '底薪+提成', meaning: '标称薪资多为提成上限，非实际到手', weight: 2.5 },
  { kind: 'salary', term: '综合收入', meaning: '把不确定的提成计入标称薪资', weight: 2 },
  { kind: 'salary', term: '平均薪资', meaning: '用平均值掩盖分布，需谨慎对待', weight: 2 },
  { kind: 'salary', term: '月入过万', meaning: '常见于提成制岗位的宣传话术', weight: 2 },
  { kind: 'salary', term: '薪资可谈', meaning: '标称区间可能并不真实', weight: 1 },
]
