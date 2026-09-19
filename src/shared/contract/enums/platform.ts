/**
 * platform 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
/**
 * 适配器成熟度（**事实**：这个平台适配到什么程度了）。
 *
 * 存在的理由：注册表里有平台 ≠ 这个平台能用。10 个适配器实际分三档
 * （可用 / 探针校准过 / 还没验过），而 `capabilities` 只描述**平台有什么能力**、
 * `implementation` 只描述**我们实现了哪些方法** —— 两者都回答不了
 * 「选它进方案会不会白跑」。没有这一轴，用户勾了 4 个平台会得到
 * 「1 个能跑 + 3 个静默返回 0 条」，而界面显示"采集完成"。
 */
export const MATURITY_LEVELS = ['stable', 'calibrated', 'experimental', 'disabled'] as const

export type MaturityLevel = (typeof MATURITY_LEVELS)[number]

export const MATURITY_LEVEL_LABEL: Record<MaturityLevel, string> = {
  stable: '可用（真实夹具 + 冒烟验证）',
  calibrated: '已校准（探针/夹具验证，缺口见备注）',
  experimental: '实验（未验证或部分未实现，可能返回空）',
  disabled: '停用（平台侧不可用，需改配置才启用）',
}

/**
 * 同上，**密集表格里用的短档**（能力矩阵一列 10 行，长标签会把表格撑到必须横向滚动）。
 *
 * 为什么放在这个文件、紧挨着长标签：界面层自己再写一份 `{stable:'可用'}` 就是
 * **第二份文案**，迟早与 `MATURITY_LEVEL_LABEL` 漂移（本项目已经为这类漂移
 * 吃过亏，见 `styles.ts` 里 `.jh-clip` 那段注释）。放在一起，改一处就够。
 */
export const MATURITY_LEVEL_SHORT: Record<MaturityLevel, string> = {
  stable: '可用',
  calibrated: '已校准',
  experimental: '实验',
  disabled: '停用',
}

export const MATURITY_LEVEL_TONE: Record<MaturityLevel, 'ok' | 'warn' | 'error' | 'muted'> = {
  stable: 'ok',
  calibrated: 'warn',
  experimental: 'error',
  disabled: 'muted',
}

/**
 * 要不要为此提醒用户（界面与 host 共用**同一份**判断，避免两处漂移）。
 * `calibrated` 不提醒：它意味着"可用，只是有已知缺口"，缺口写在 notes 里按需查看。
 */
export function maturityNeedsWarning(level: MaturityLevel): boolean {
  return level === 'experimental' || level === 'disabled'
}

/** 某个环节要不要登录（**平台事实**，`unknown` = 没验证过，不假装知道）。 */
export const AUTH_REQUIREMENTS = ['none', 'required', 'unknown'] as const

export type AuthRequirementValue = (typeof AUTH_REQUIREMENTS)[number]

export const AUTH_REQUIREMENT_LABEL: Record<AuthRequirementValue, string> = {
  none: '不需要登录',
  required: '需要登录',
  unknown: '尚未验证',
}
