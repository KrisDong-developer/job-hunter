/**
 * 错误信息 → **人话**（host 与 client 共用）。
 *
 * 实测的界面缺陷：运行历史里直接把 `errorMsg` 印出来，于是非技术用户看到的是
 *
 *     page.evaluate: ReferenceError: maxCards is not defined
 *         at extractJobsInPage (eval at evaluate (:302:30), <anonymous>:42:11)
 *         at Page.evaluate (...)
 *
 * —— 一串堆栈。用户既读不懂，也不知道该做什么。
 *
 * 这一层做两件事：
 *   1. 给一个**短句**（"适配器脚本执行异常"），让用户一眼知道出在哪一类；
 *   2. 给一个 `kind`，界面据此提供**下一步怎么办**（而不是"死胡同"提示）；
 *      原始全文仍然完整保留在 `detail` 里，可展开查看 —— **不隐藏信息**。
 *
 * 纯函数：所以宿主日志、工具返回文本、界面提示三处用的是同一份判断。
 */

/** 故障类别 —— 界面据此给排查入口，不自己猜。 */
export type FailureKind =
  | 'selector'
  | 'script'
  | 'login'
  | 'risk'
  | 'navigation'
  | 'platform-paused'
  | 'quota'
  | 'offline'
  | 'unknown'

export interface FailureText {
  kind: FailureKind
  /** 一句话短句，直接显示。 */
  short: string
  /** 这一类故障**下一步该做什么**（人话，可执行）。 */
  advice: string
  /** 原始信息（完整保留，界面折叠展示）。`null` = 没有原始信息可给。 */
  detail: string | null
  /** 原始信息看起来像代码堆栈吗（界面据此换一句更友好的标签）。 */
  looksTechnical: boolean
}

/** 代码 / 堆栈特征。命中了就说明"这不是网络问题，是脚本或选择器被改坏了"。 */
const TECHNICAL_PATTERNS: RegExp[] = [
  /page\.evaluate/i,
  /\b(ReferenceError|TypeError|SyntaxError|RangeError)\b/,
  /is not defined/,
  /\n\s+at\s+/,
  /\.js:\d+:\d+/,
  /evaluate \(eval at/,
]

export function looksLikeStackTrace(message: string): boolean {
  return TECHNICAL_PATTERNS.some((pattern) => pattern.test(message))
}

/** 按错误码判定类别。未知码退化为"看原始信息"而不是假装知道。 */
function kindOf(errorCode: string | null, message: string): FailureKind {
  switch (errorCode) {
    case 'NO_RECORDS':
      return 'selector'
    case 'PARSE_FAILED':
      return looksLikeStackTrace(message) ? 'script' : 'selector'
    case 'NOT_LOGGED_IN':
      return 'login'
    case 'BLOCKED':
    case 'RATE_LIMITED':
    case 'RISK':
      return 'risk'
    case 'NAVIGATION_FAILED':
      return 'navigation'
    case 'PLATFORM_PAUSED':
      return 'platform-paused'
    case 'QUOTA_REACHED':
      return 'quota'
    case 'OFFLINE':
      return 'offline'
    default:
      return looksLikeStackTrace(message) ? 'script' : 'unknown'
  }
}

const SHORT: Record<FailureKind, string> = {
  selector: '没解析到岗位（选择器可能失效）',
  script: '代码语法异常',
  login: '平台要求先登录',
  risk: '被平台风控拦住了',
  navigation: '打不开搜索页',
  'platform-paused': '平台已暂停写入',
  quota: '今天的次数已达上限',
  offline: '离线模式已开启',
  unknown: '运行出错',
}

const ADVICE: Record<FailureKind, string> = {
  selector:
    '页面打开了但一条岗位都没解析出来，通常是招聘站改了页面结构、选择器对不上了。' +
    '先在下面的「平台状态」里看是哪个字段连续缺失，再按「排查方案」逐条核对。',
  script:
    '解析脚本在页面里执行时报错了（不是网络问题）。这通常意味着脚本或选择器配置被改坏了，' +
    '展开下面的原始信息能看到具体是哪一行。',
  login: '在下面的「平台状态」里点「登录」，在弹出的浏览器窗口里完成登录后，定时会自动恢复。',
  risk:
    '平台识别出了自动化访问并限流/要求验证。这类信号**一次就会暂停**该方案，' +
    '确认环境正常后再点方案上的「确认恢复」；系统不会自动重试。',
  navigation:
    '连搜索页都没打开成功。先确认能正常上网、以及该站点没有被网络策略拦住，然后手动跑一次看是否恢复。',
  'platform-paused':
    '适配器处于降级/失效状态，此时**只解析不写库**（避免把脏数据写进去）。修好解析后跑一轮成功即自动恢复。',
  quota: '这是每日上限在起作用（防失控的保险丝）。等明天，或直接在方案上点「立即采集」人工跑一次。',
  offline:
    '环境变量 DSH_JOB_HUNTER_NO_NETWORK 开着时不会发起任何真实访问 —— 这是"自动化测试绝不访问真实招聘站"的开关。',
  unknown: '展开下面的原始信息可以看到完整原因；如果反复出现，把它连同「平台状态」一起反馈。',
}

export function adviceForFailure(kind: FailureKind): string {
  return ADVICE[kind]
}

export function failureKindOf(errorCode: string | null, message: string): FailureKind {
  return kindOf(errorCode, message)
}

/**
 * 把一条失败信息翻成人话。
 *
 * @param errorCode 适配器/领域层给的错误码（可为 null）
 * @param errorMsg  原始信息（可为 null；可能是长堆栈）
 */
export function humanizeFailure(errorCode: string | null, errorMsg: string | null): FailureText | null {
  const raw = (errorMsg ?? '').trim()
  if (errorCode === null && raw === '') return null

  const kind = kindOf(errorCode, raw)
  const technical = raw !== '' && looksLikeStackTrace(raw)
  // 短句优先用"类别"，但 navgiation/platform-paused 这类**码本身就更具体**时保留原始摘要：
  // 把 `打不开搜索页（net::ERR_NAME_NOT_RESOLVED）` 压成"打不开搜索页"会丢掉唯一有用的线索。
  const short =
    kind === 'navigation' && raw !== '' && !technical
      ? `打不开搜索页（${firstLine(raw)}）`
      : SHORT[kind]

  return {
    kind,
    short,
    advice: ADVICE[kind],
    detail: raw === '' ? null : raw,
    looksTechnical: technical,
  }
}

/** 取第一行并截断 —— 用在"短句"里嵌原始信息的场合。 */
function firstLine(message: string): string {
  const line = message.split('\n')[0] ?? ''
  return line.length > 60 ? `${line.slice(0, 57)}…` : line
}

/** 故障类别 → 界面上的短标签（"排查方案"的标题用）。 */
export const FAILURE_KIND_LABEL: Record<FailureKind, string> = {
  selector: '选择器失效',
  script: '脚本异常',
  login: '未登录',
  risk: '风控拦截',
  navigation: '网络/导航',
  'platform-paused': '平台降级',
  quota: '次数上限',
  offline: '离线模式',
  unknown: '未知原因',
}
