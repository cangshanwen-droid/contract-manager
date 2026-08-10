/**
 * NetworkStatusBar — 全局网络连接状态条
 *
 * 产品需求（断网体验分层设计·第 2 层）：
 * - 使用中断网/服务器不可达时，顶部常驻金色警示条，不弹窗轰炸
 * - 每 15s 探测一次云端健康；恢复后状态条自动消失
 * - 文案用普通用户能懂的语言（不使用"云端"等技术词）
 */
import React, { useEffect, useRef, useState } from 'react'
import { CLOUD_API_BASE } from '../../../../shared/cloud-config'
import { tokens as T } from '../../styles/design-tokens'

const PROBE_INTERVAL_MS = 15000

export default function NetworkStatusBar(): React.ReactElement | null {
  const [offline, setOffline] = useState(false)
  const [since, setSince] = useState<number | null>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    let cancelled = false

    const probe = async (): Promise<void> => {
      if (inFlight.current) return
      inFlight.current = true
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6000)
      try {
        const res = await fetch(`${CLOUD_API_BASE}/api/health`, { signal: controller.signal })
        if (cancelled) return
        if (res.ok) {
          setOffline(false)
          setSince(null)
        } else {
          setOffline(true)
          setSince((prev) => prev ?? Date.now())
        }
      } catch {
        if (cancelled) return
        setOffline(true)
        setSince((prev) => prev ?? Date.now())
      } finally {
        clearTimeout(timer)
        inFlight.current = false
      }
    }

    void probe()
    const id = setInterval(probe, PROBE_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (!offline) return null

  const fmt = since
    ? `${Math.max(1, Math.round((Date.now() - since) / 60000))} 分钟`
    : '刚刚'

  return (
    <div
      style={{
        background: 'rgba(212,175,55,0.10)',
        borderBottom: `1px solid ${T.accent}`,
        padding: '6px 32px',
        fontSize: 12,
        color: T.accent,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
      role="status"
    >
      <span style={{ fontWeight: 600 }}>⚠ 网络连接异常</span>
      <span style={{ opacity: 0.85 }}>
        数据可能不是最新，已持续 {fmt}。系统每 15 秒自动重试，网络恢复后自动继续。
      </span>
    </div>
  )
}
