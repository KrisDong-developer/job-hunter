/**
 * 把一段文本写进剪贴板。返回是否成功 —— 调用方负责如实提示。
 *
 * 单独抽出来是因为现在有两个调用点（数据文件路径、留痕 JSON），
 * 而"复制失败要说话"这条纪律必须两边一致：按钮点了没反应比报错更让人怀疑界面坏了。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
