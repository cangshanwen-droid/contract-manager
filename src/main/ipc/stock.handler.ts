import { ipcMain, app } from 'electron'
import { net } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { IPC_CHANNELS } from '../../shared/constants'
import { PERMISSIONS } from '../../shared/permissions'
import { readSyncLog } from '../stock-sync'
import { getSessionUser, requirePermission } from '../session'
import { CLOUD_API_BASE } from '../../shared/cloud-config'
import { getAdminKey } from '../credential-store'

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
  ipcMain.handle(IPC_CHANNELS.STOCK_ADMIN, async (_event, payload: { action?: unknown; symbol?: unknown }) => {
    const session = getSessionUser()
    if (!session || session.role !== 'admin') {
      return { success: false, code: 'FORBIDDEN', message: '仅管理端可使用市场控制台' }
    }
    const key = getAdminKey()
    if (!key) return { success: false, code: 'NO_ADMIN_KEY', message: '未配置管理端密钥' }

    const action = typeof payload?.action === 'string' ? payload.action : ''
    const symbol = typeof payload?.symbol === 'string' ? payload.symbol.trim().toUpperCase() : ''
    const routes: Record<string, { method: 'GET' | 'POST' | 'DELETE'; path: string; confirmation?: string }> = {
      overview: { method: 'GET', path: '/admin/control/overview' },
      accounts: { method: 'GET', path: '/admin/accounts' },
      stocks: { method: 'GET', path: '/admin/stocks' },
      audit: { method: 'GET', path: '/admin/audit-logs?limit=80' },
      close: { method: 'POST', path: '/admin/market/close' },
      open: { method: 'POST', path: '/admin/market/open' },
      previous: { method: 'POST', path: '/admin/market/previous-round' },
      reset: { method: 'POST', path: '/admin/market/reset-round1', confirmation: 'RESET ROUND 1' },
      restore: { method: 'POST', path: '/admin/stocks/restore' },
    }
    if (action === 'delete-stock') {
      if (!/^[A-Z][A-Z0-9]{1,9}$/.test(symbol)) {
        return { success: false, code: 'INVALID_ARGUMENT', message: '证券代码格式不正确' }
      }
      routes[action] = { method: 'DELETE', path: `/admin/stocks/${encodeURIComponent(symbol)}` }
    }
    const route = routes[action]
    if (!route) return { success: false, code: 'INVALID_ACTION', message: '不支持的管理操作' }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000)
    try {
      const headers: Record<string, string> = { 'X-Admin-Key': key }
      if (route.confirmation) headers['X-Confirm-Action'] = route.confirmation
      const res = await net.fetch(`${CLOUD_API_BASE}${route.path}`, {
        method: route.method,
        headers,
        cache: 'no-store',
        signal: controller.signal,
      })
      const body = await res.json().catch(() => ({})) as any
      if (!res.ok) return { success: false, code: `HTTP_${res.status}`, message: body?.detail || `管理操作失败 (${res.status})` }
      return { success: true, data: body }
    } catch (error: any) {
      return {
        success: false,
        code: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: error?.name === 'AbortError' ? '市场控制请求超时，请稍后重试' : '股票服务连接异常，请检查网络后重试',
      }
    } finally {
      clearTimeout(timeoutId)
    }
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_CREATE, async (_event, payload: { symbol?: unknown; name?: unknown; price?: unknown; sector?: unknown; total_shares?: unknown; revenue?: unknown; industry_pe?: unknown; premium_rate?: unknown; carbon_price?: unknown; volatility?: unknown }) => {
    const session = getSessionUser()
    if (!session || session.role !== 'admin') {
      return { success: false, code: 'FORBIDDEN', message: '仅管理端可以创建上市证券', rollbackSafe: true }
    }
    const key = getAdminKey()
    if (!key) return { success: false, code: 'NO_ADMIN_KEY', message: '未配置管理端密钥', rollbackSafe: true }

    const symbol = typeof payload?.symbol === 'string' ? payload.symbol.trim().toUpperCase() : ''
    const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
    const price = Number(payload?.price)
    const sector = typeof payload?.sector === 'string' ? payload.sector.trim() : ''
    const totalShares = Number(payload?.total_shares ?? 0)
    const revenue = Number(payload?.revenue ?? 0)
    const industryPe = Number(payload?.industry_pe ?? 20)
    const premiumRate = Number(payload?.premium_rate ?? 50)
    const carbonPrice = Number(payload?.carbon_price ?? 50)
    const volatility = Number(payload?.volatility ?? 0.015)
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(symbol) || !name || !Number.isFinite(price) || price <= 0 ||
        ![totalShares, revenue, industryPe, premiumRate, carbonPrice, volatility].every(Number.isFinite) ||
        totalShares < 0 || revenue < 0 || industryPe <= 0 || premiumRate < 0 || carbonPrice < 0 || volatility < 0.002 || volatility > 0.05) {
      return { success: false, code: 'INVALID_ARGUMENT', message: '证券资料不完整或格式不正确', rollbackSafe: true }
    }

    const reconcile = async (): Promise<'exists' | 'absent' | 'unknown'> => {
      try {
        const marketRes = await net.fetch(`${CLOUD_API_BASE}/market`, { cache: 'no-store' })
        if (!marketRes.ok) return 'unknown'
        const marketBody = await marketRes.json() as any
        const stocks = Array.isArray(marketBody) ? marketBody : marketBody?.stocks
        if (!Array.isArray(stocks)) return 'unknown'
        return stocks.some((stock: any) => String(stock?.symbol || '').toUpperCase() === symbol) ? 'exists' : 'absent'
      } catch {
        return 'unknown'
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    try {
      const res = await net.fetch(`${CLOUD_API_BASE}/market/stocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key },
        body: JSON.stringify({ symbol, name, price, sector, total_shares: totalShares, revenue, industry_pe: industryPe, premium_rate: premiumRate, carbon_price: carbonPrice, volatility }),
        signal: controller.signal,
      })
      const body = await res.json().catch(() => ({})) as any
      if (res.ok) return { success: true, stock: body }
      if (res.status >= 400 && res.status < 500) {
        return { success: false, message: body?.detail || `创建股票失败 (${res.status})`, rollbackSafe: true }
      }
      const state = await reconcile()
      if (state === 'exists') return { success: true, stock: { symbol, name, price }, reconciled: true }
      return { success: false, message: body?.detail || '股票服务暂时不可用', rollbackSafe: state === 'absent' }
    } catch (error: any) {
      const state = await reconcile()
      if (state === 'exists') return { success: true, stock: { symbol, name, price }, reconciled: true }
      return {
        success: false,
        message: state === 'unknown' ? '创建结果暂时无法确认，请稍后刷新行情核对' : '网络连接异常，股票未创建',
        rollbackSafe: state === 'absent',
        code: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      }
    } finally {
      clearTimeout(timeoutId)
    }
  })

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
      const res = await net.fetch(`${CLOUD_API_BASE}/market/stocks`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return { success: false, message: `HTTP ${res.status}` }
      const data = await res.json() as any
      return { success: true, stock_count: Array.isArray(data) ? data.length : 0 }
    } catch (e: any) {
      // 网络不可达统一友好提示（用户视角，不暴露底层错误）
      const msg = (e?.message || '').toLowerCase()
      if (e?.name === 'AbortError' || msg.includes('fetch') || msg.includes('network') || msg.includes('econnrefused') || msg.includes('etimedout')) {
        return { success: false, message: '网络连接异常：请检查网络后重试' }
      }
      return { success: false, message: e.message || '网络错误' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_SYNC_LOG, () => {
    try { return { success: true, lines: readSyncLog() } }
    catch (e: any) { return { success: false, message: e.message } }
  })
}
