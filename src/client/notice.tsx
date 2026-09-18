import { useEffect, useState } from 'react'
import { NOTICE_TTL_MS, PLUGIN_ID } from '../shared/constants.js'

const SEEN_KEY = `${PLUGIN_ID}:notice-seen`

/**
 * `shell.overlay` 上的就绪提示。
 *
 * F1（P0 实测踩到的坑）：这一层是**常驻层**，条目一旦渲染就永久占位。
 * 而它的定位恰恰是“补偿 panellist 没有徽标位”（C7），所以两条必须同时成立：
 *   ① 没有要说的就返回 `null` —— 绝不渲染常驻占位；
 *   ② 有内容时自动消失，并允许手动关闭。
 * 这里再用 sessionStorage 把它限制成“每个标签页只说一次”，避免刷新就打扰。
 */
export function JobHunterNotice() {
  const [open, setOpen] = useState(() => !hasSeen())

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      markSeen()
      setOpen(false)
    }, NOTICE_TTL_MS)
    return () => window.clearTimeout(timer)
  }, [open])

  if (!open) return null

  return (
    <div className="jh-notice" role="status" aria-live="polite">
      <span className="jh-notice-text">求职找工作已就绪</span>
      <button
        type="button"
        className="jh-notice-close"
        aria-label="关闭提示"
        onClick={() => {
          markSeen()
          setOpen(false)
        }}
      >
        ×
      </button>
    </div>
  )
}

function hasSeen(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function markSeen(): void {
  try {
    window.sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* 隐私模式/禁用存储下忽略：只是提示会多出现一次，不影响功能 */
  }
}
