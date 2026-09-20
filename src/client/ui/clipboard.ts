/**
 * 把一段文本写进剪贴板（第五轮统一）。
 *
 * 此前项目里有**两套**实现：设置屏的 `copyToClipboard`（只试 `navigator.clipboard`）
 * 与岗位详情海外信件的就地 `copyText`（失败退回临时 textarea）。同一件小事两种行为，
 * 于是"在某些环境里复制按钮没反应"只在其中一处被兜住过。
 *
 * 这里合成一份，顺序是：
 *   1. `navigator.clipboard.writeText` —— 标准路径（需要安全上下文与用户手势）；
 *   2. 失败则退回隐藏 textarea + `document.execCommand('copy')` ——
 *      桌面宿主 / 非安全上下文下 `navigator.clipboard` 可能就是没有。
 *
 * 返回**是否成功**：调用方负责如实提示。按钮点了没反应比报错更让人怀疑界面坏了 ——
 * 所以不要吞掉 false。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* 走下面的兜底 */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    // 不让它影响版面与滚动位置：固定在视口外，且不参与布局流
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
