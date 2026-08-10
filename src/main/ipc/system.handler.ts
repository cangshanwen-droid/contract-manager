/**
 * system.handler.ts - 系统健康检查
 *
 * 服务器状态（系统设置页"服务器状态"卡片 + 管理端概览）：
 *  - 云端 API 健康：GET ${CLOUD_API_BASE}/api/regions（云端模式数据源）
 *  - 股票 API 健康：GET ${CLOUD_API_BASE}/market/stocks（股票行情数据源）
 *  - 本地数据库：SQLite 连通性与行数
 *
 * 采用 Electron net.fetch + AbortController 超时，不依赖浏览器 fetch。
 */

import { ipcMain, net } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { PERMISSIONS } from '../../shared/permissions'
import { queryOne } from '../database/helpers'
import { requirePermission } from '../session'
import type { SystemHealth } from '../../shared/types'
import { CLOUD_API_BASE } from '../../shared/cloud-config'

const API_BASE = '${CLOUD_API_BASE}'
const HEALTH_TIMEOUT_MS = 5000

async function ping(url: string, name: string): Promise<{ ok: boolean; latency_ms: number | null; message?: string }> {
  const started = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
    const res = await net.fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timer)
    const latency = Date.now() - started
    if (!res.ok) {
      return { ok: false, latency_ms: latency, message: `HTTP ${res.status}` }
    }
    // 消耗响应体以完成请求（net.fetch 需要读取 body 才算结束）
    await res.text().catch(() => '')
    return { ok: true, latency_ms: latency }
  } catch (e: any) {
    const latency = Date.now() - started
    const msg = e?.name === 'AbortError' ? `超时（>${HEALTH_TIMEOUT_MS / 1000}s）` : (e?.message || '网络错误')
    return { ok: false, latency_ms: latency, message: msg }
  }
}

export function registerSystemHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SYSTEM_HEALTH, async () => {
    try {
      const perm = requirePermission(PERMISSIONS.SYSTEM_CONFIG, '没有查看服务器状态的权限')
      if (!perm.ok) return perm.response

      // 并行健康检查：云端数据 API 与 股票行情 API（同一台服务器不同服务）
      const [cloud, stock] = await Promise.all([
        ping(`${API_BASE}/api/regions`, '云端数据 API'),
        ping(`${API_BASE}/market/stocks`, '股票行情 API'),
      ])

      let dbOk = true
      let dbTables = 0
      try {
        const row = queryOne("SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table'")
        dbTables = Number(row?.cnt ?? 0)
      } catch (e) {
        dbOk = false
      }

      const health: SystemHealth = {
        cloud_api: { name: '云端数据 API', ok: cloud.ok, latency_ms: cloud.latency_ms, message: cloud.message },
        stock_api: { name: '股票行情 API', ok: stock.ok, latency_ms: stock.latency_ms, message: stock.message },
        db_ok: dbOk,
        checked_at: new Date().toISOString(),
      }
      // 附带本地数据库表数（用于前端展示）
      return { success: true, health: { ...health, db_tables: dbTables } }
    } catch (err: any) {
      console.error('SYSTEM_HEALTH failed:', err)
      return { success: false, message: `健康检查失败：${err.message || '未知错误'}` }
    }
  })
}
