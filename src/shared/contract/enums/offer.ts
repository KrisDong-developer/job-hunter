/**
 * offer 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
// Offer（§4.H H1/H3/H4）
/**
 * Offer 状态。
 *
 * 四个值都是**用户的事实**，不是我们能推断的东西 —— 所以没有任何自动流转：
 * `pending`（还没决定）→ `accepted` / `declined` 只能由人写；`expired` 是
 * "截止时间过了还没决定"的显式落库（由用户在界面上确认，不做自动改写 ——
 * 自动把 pending 改成 expired 会在用户刚谈妥延期时把事实改错）。
 */
export const OFFER_STATES = ['pending', 'accepted', 'declined', 'expired'] as const

export type OfferState = (typeof OFFER_STATES)[number]

export const OFFER_STATE_LABEL: Record<OfferState, string> = {
  pending: '待决定',
  accepted: '已接受',
  declined: '已拒绝',
  expired: '已过期',
}

/**
 * 还没决定的状态 —— 只有这些才需要"截止倒计时"（H3）。
 *
 * 单独一个常量而不是各处写 `state === 'pending'`：倒计时出现在今日、offer 列表
 * 与提醒三处，三处各写一遍必然漂移（漏掉一处就会对着已拒绝的 offer 催用户）。
 */
export const OFFER_OPEN_STATES: readonly OfferState[] = ['pending']
