import { ipcMain, app } from 'electron'
import { net } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { IPC_CHANNELS } from '../../shared/constants'
import { PERMISSIONS } from '../../shared/permissions'
import { readSyncLog } from '../stock-sync'
import { requirePermission } from '../session'
import { CLOUD_API_BASE } from '../../shared/cloud-config'

const TOKEN_FILE = path.join(app.getPath('userData'), 'stock-token.txt')

function getToken(): string {
  try {
    if (fs.existsSync(TOKEN_FILE)) return fs.readFileSync(TOKEN_FILE, 'utf-8').trim()
  } catch { /* */ }
  return ''
}

function setToken(token: string): void {
  fs.writeFileSync(TOKEN_FILE, token, 'utf-8')
}

export function registerStockHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.STOCK_SET_TOKEN, (_e, token: string) => {
    try {
      // 交易凭据配置属于股票交易权限点
      const perm = requirePermission(PERMISSIONS.STOCK_TRADE, '没有股票交易的权限')
      if (!perm.ok) return perm.response
      setToken(token)
      return { success: true }
    } catch (e: any) {
      return { success: false, message: e.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_TEST_CONNECTION, async () => {
    const perm = requirePermission(PERMISSIONS.STOCK_TRADE)
    if (!perm.ok) return perm.response
    const token = getToken()
    if (!token) return { success: false, message: '未配置Token' }

    try {
      const res = await net.fetch('${CLOUD_API_BASE}/market/stocks', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return { success: false, message: `HTTP ${res.status}` }
      const data = await res.json() as any
      return { success: true, stock_count: Array.isArray(data) ? data.length : 0 }
    } catch (e: any) {
      return { success: false, message: e.message || '网络错误' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_SYNC_LOG, () => {
    try { return { success: true, lines: readSyncLog() } }
    catch (e: any) { return { success: false, message: e.message } }
  })
}
