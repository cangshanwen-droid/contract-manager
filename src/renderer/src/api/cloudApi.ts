/**
 * cloudApi.ts - 云端 API 直连模块
 * 当用户开启「云端模式」后，所有数据请求直接发往 ${CLOUD_API_BASE}
 * 否则走 Electron IPC（本地 SQLite）
 *
 * 认证：使用 Gipfel 统一登录 token（gipfel_auth_token），不再需要单独的 stock token
 */

import { CLOUD_API_BASE } from '../../../shared/cloud-config'
import { IPC_CHANNELS, type IpcChannel } from '../../../shared/constants'

const API_BASE = `${CLOUD_API_BASE}`
const AUTH_TOKEN_KEY = 'gipfel_auth_token'
const CLOUD_MODE_KEY = 'cloudMode'

/** 云端请求超时（P0-2 修复）：断网时 10s 内中止，避免请求悬挂 30s+ */
const REQUEST_TIMEOUT_MS = 10000

// ── 云端模式（固定开启）──
//
// 产品决策：多办公点共享同一云端，固定云端模式，不提供本地模式切换。
// 本地模式会导致"数据不互通"（本地 SQLite 与云端 REST 两套存储），
// 用户误切换后录的数据在云端不可见，体验陷阱。故 isCloudMode 恒 true，
// setCloudMode 保留签名但不再生效（兼容旧调用）。

export function isCloudMode(): boolean {
  return true
}

export function setCloudMode(_v: boolean): void {
  // 固定云端模式：忽略切换请求（不再写入 localStorage）
  return
}

// ── token 管理 ──

export function getAuthToken(): string {
  try { return localStorage.getItem(AUTH_TOKEN_KEY) || '' }
  catch { return '' }
}

export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY)
}

// ── 云端登录：同时获取云端 JWT token ──

/**
 * 调用云端 /api/auth/login 获取真正的 JWT token 并存储。
 * 不抛异常 - 网络失败时静默降级，保留本地登录态。
 * 返回云端 token，失败返回空字符串。
 */
export async function cloudLogin(username: string, password: string): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await window.fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    })
    if (!res.ok) return ''
    const data = await res.json()
    const token = data?.token || data?.access_token || ''
    if (token) setAuthToken(token)
    return token
  } catch {
    // 网络不通时静默降级 - 不影响本地登录
    return ''
  } finally {
    clearTimeout(timeoutId)
  }
}

// ── fetch 封装 ──

async function cloudFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = getAuthToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  // P0-2 修复：AbortController 10s 超时，断网时中止悬挂请求
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await window.fetch(`${API_BASE}${path}`, { ...options, headers, signal: controller.signal })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`云端 API 错误 ${res.status}: ${body || res.statusText}`)
    }
    return res.json()
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`网络连接异常（已等待 ${REQUEST_TIMEOUT_MS / 1000} 秒）：请检查网络后重试`)
    }
    // 网络不可达（DNS/连接被拒/离线）——统一翻译为用户能懂的语言
    if (err instanceof TypeError || err?.message === 'Failed to fetch' || err?.message?.includes('fetch')) {
      throw new Error('网络连接异常：请检查网络后重试')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

// ── 公开导出 fetch 供直接调用（股票页面使用）──
// ⚠️ 修复（v1.3.0 严重 bug）：此前 `export const fetch = cloudFetch` 在模块作用域
// 覆盖了全局 fetch——cloudFetch 内部 `await fetch(...)` 因此调用自身 → 无限递归
// → 每次云端请求 Maximum call stack size exceeded（用户看到"加载失败"）。
// 无人 import 此导出，直接移除；cloudFetch 内部显式用 window.fetch。
// export const fetch = cloudFetch

/** 云端完整版地址（股票交易 Arena） */
export const CLOUD_ARENA_URL = `${CLOUD_API_BASE}`

/**
 * 获取管理端密钥：经 IPC admin:get-key 由主进程提供
 * （环境变量 GIPFEL_ADMIN_KEY → userData/admin-key.txt），渲染进程不持有任何密钥常量。
 */
export async function getAdminKey(): Promise<string | null> {
  try {
    const r = await window.api.invoke('admin:get-key') as { success?: boolean; key?: string } | null
    if (r?.success && r.key) return r.key
  } catch { /* 主进程不可用时返回 null */ }
  return null
}

/** 管理端 API 调用：带 X-Admin-Key 头（密钥来自主进程，不在渲染进程硬编码） */
async function adminRequest(url: string, init: RequestInit = {}): Promise<any> {
  const key = await getAdminKey()
  if (!key) {
    throw new Error('未配置管理端密钥（请设置环境变量 GIPFEL_ADMIN_KEY 或 userData 下 admin-key.txt）')
  }
  // P0-2 修复：AbortController 10s 超时，断网时中止悬挂请求
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await window.fetch(url, {
      ...init,
      method: init.method || 'GET',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers as Record<string, string> || {}),
        'X-Admin-Key': key,
      },
      cache: 'no-store' as RequestCache,
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.detail || `请求失败 (${res.status})`)
    }
    return res.json()
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`云端请求超时（${REQUEST_TIMEOUT_MS / 1000}s）：${url}`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

/** 管理端监控 API 调用（GET）。 */
export async function fetchWithAdminKey(url: string): Promise<any> {
  return adminRequest(url)
}

// ── 云端 invoke：将 IPC channel 映射到 REST ──

type PathResolver = (...args: unknown[]) => string

interface RouteEntry {
  method: string
  path: string | PathResolver
  /** 可选 body 构造器：无则沿用「最后一个对象参数作 body」的约定 */
  body?: (args: unknown[]) => unknown
}

/**
 * ROUTE_MAP（P1-1 修复）：
 * - key 类型由 `keyof typeof IPC_CHANNELS` 派生（IpcChannel），编译期防双源漂移：
 *   新增/改名通道若未在此登记映射，将不再静默降级本地 IPC。
 * - 云端模式下：命中 ROUTE_MAP → 走云端 REST；命中 LOCAL_ONLY_CHANNELS → 明确报错「仅本地模式可用」；
 *   两者皆未命中（新通道忘了归类）→ 同样报错，杜绝静默降级导致的数据分叉。
 */
const ROUTE_MAP: Partial<Record<IpcChannel, RouteEntry>> = {
  'region:list':          { method: 'GET',    path: '/api/regions' },
  'region:get':           { method: 'GET',    path: (id: unknown) => `/api/regions/${id}` },
  'region:create':        { method: 'POST',   path: '/api/regions' },
  'region:update':        { method: 'PUT',    path: (id: unknown) => `/api/regions/${id}` },
  'region:delete':        { method: 'DELETE', path: (id: unknown) => `/api/regions/${id}` },

  'company:list':         { method: 'GET',    path: '/api/companies' },
  'company:get':          { method: 'GET',    path: (id: unknown) => `/api/companies/${id}` },
  'company:create':       { method: 'POST',   path: '/api/companies' },
  'company:update':       { method: 'PUT',    path: (id: unknown) => `/api/companies/${id}` },
  'company:delete':       { method: 'DELETE', path: (id: unknown) => `/api/companies/${id}` },

  'contract:list': {
    method: 'GET',
    // P1-1 分页：默认 limit=200（防全表拖拽），显式传 opts.limit/offset 可覆盖
    path: (regionId?: unknown, opts?: { limit?: number; offset?: number }) => {
      const p = new URLSearchParams()
      if (regionId != null) p.set('region_id', String(regionId))
      const limit = opts?.limit ?? 200
      const offset = opts?.offset ?? 0
      p.set('limit', String(limit))
      if (offset > 0) p.set('offset', String(offset))
      return `/api/contracts?${p.toString()}`
    }
  },
  'contract:get':         { method: 'GET',    path: (id: unknown) => `/api/contracts/${id}` },
  'contract:create':      { method: 'POST',   path: '/api/contracts' },
  'contract:update':      { method: 'PUT',    path: (id: unknown) => `/api/contracts/${id}` },
  'contract:delete':      { method: 'DELETE', path: (id: unknown) => `/api/contracts/${id}` },
  // P1-1 补全：审批写操作映射云端（不再静默降级本地 SQLite，避免与云端数据分叉）
  'contract:approve':     { method: 'POST',   path: (id: unknown) => `/api/contracts/${id}/approve`, body: (args) => ({ action: args[1], operator: args[2] }) },
  'contract:reject':      { method: 'POST',   path: (id: unknown) => `/api/contracts/${id}/reject` },
  'contract:batch-approve': { method: 'POST', path: '/api/contracts/batch-approve', body: (args) => ({ ids: args[0], action: args[1], operator: args[2] }) },
  'contract:summarize':   { method: 'GET',    path: (regionId: unknown) => `/api/contracts/summarize/${regionId}` },
  'contract:list-versions': { method: 'GET', path: (id: unknown) => `/api/contracts/${id}/versions` },

  'contract-type:list':   { method: 'GET',    path: '/api/contracts/types/all' },

  'infra-type:list':      { method: 'GET',    path: '/api/infra/types' },

  'dashboard:summary':    { method: 'GET',    path: '/api/dashboard/summary' },
  'dashboard:system-stats': { method: 'GET',  path: '/api/dashboard/system-stats' },

  'system:health':        { method: 'GET',    path: '/api/health' },

  'formula:calculate':    { method: 'POST',   path: '/api/formula/calculate' },
  'formula:log-list':     { method: 'GET',    path: (regionId: unknown) => `/api/formula/logs/${regionId}` },

  'infra-calc:load':      { method: 'GET',    path: (regionId: unknown) => `/api/infra/calculate?region_id=${regionId}` },

  'auth:login':            { method: 'POST',   path: '/api/auth/login' },
  'auth:logout':           { method: 'POST',   path: '/api/auth/logout' },
  'auth:register':         { method: 'POST',   path: '/api/auth/register' },
  'auth:change-password':  { method: 'POST',   path: '/api/auth/change-password',
                             body: (args: unknown[]) => ({ old_password: args[0], new_password: args[1] }) },
  'auth:reset-password':   { method: 'POST',   path: (id: unknown) => `/api/auth/users/${id}/reset-password`,
                              body: (args) => ({ new_password: args[1] }) },

  'account:summary':      { method: 'GET',    path: '/api/accounts/summary/all' },
  'account:list':         { method: 'GET',    path: '/api/accounts' },
  'account:get':          { method: 'GET',    path: (id: unknown) => `/api/accounts/${id}` },
  'account:create':       { method: 'POST',   path: '/api/accounts' },
  'account:transactions': { method: 'GET',    path: (id: unknown) => `/api/accounts/${id}/transactions` },
  'account:add-transaction': { method: 'POST', path: '/api/accounts/transactions' },
  'account:years':        { method: 'GET',    path: '/api/accounts/years' },

  'announcement:active-list': { method: 'GET', path: '/api/announcements/active' },

  'report:land-area':              { method: 'GET', path: '/api/reports/land-area' },
  'report:land-area-by-region':    { method: 'GET', path: '/api/reports/land-area-by-region' },

  // 股票通道：仅保留渲染端实际调用的 get-market（行情），其余交易在 iframe 内完成
  'stock:get-market':             { method: 'GET', path: '/market' },

  'announcement:create':          { method: 'POST', path: '/api/announcements' },
  'announcement:list':            { method: 'GET', path: '/api/announcements' },
  'announcement:delete':          { method: 'DELETE', path: (id: unknown) => `/api/announcements/${id}` },
  'auth:list-users':              { method: 'GET', path: '/api/auth/users' },
  'auth:create-user':             { method: 'POST', path: '/api/auth/users',
                                    body: (args: unknown[]) => {
                                      // args: [username, password, role, companyId, operator, operatorRole, companyIds]
                                      const companyIds = Array.isArray(args[6]) ? (args[6] as number[]) : null
                                      return {
                                        username: args[0], password: args[1], role: args[2],
                                        org_id: (args[3] as number | null | undefined) ?? null,
                                        company_ids: companyIds,
                                        stock_adjustable: args[7] != null ? (args[7] ? 1 : 0) : 1
                                      }
                                    } },
  'auth:delete-user':             { method: 'DELETE', path: (id: unknown) => `/api/auth/users/${id}` },
  'audit:list':                   { method: 'GET', path: '/api/audit' },
  'audit:log':                    { method: 'POST', path: '/api/audit/log' },

  'notification:list':            { method: 'GET', path: '/api/notifications' },
  'notification:unread-count':    { method: 'GET', path: '/api/notifications/unread-count' },
  'notification:mark-read':       { method: 'POST', path: (id?: unknown) => id != null ? `/api/notifications/${id}/read` : '/api/notifications/read-all' },

  'db:auto-backup':               { method: 'GET', path: '/api/backup/auto' },
  'db:info':                      { method: 'GET', path: '/api/backup/info' },
  'excel:export':                 { method: 'GET', path: '/api/excel/export' },
  'excel:import':                 { method: 'POST', path: '/api/excel/import' },
}

/**
 * 本地专属通道（P1-1）：依赖本地文件系统 / 本地数据库 / 系统窗口 / 凭据加密，
 * 云端模式没有对应语义，一律显式报错，禁止静默降级本地 IPC。
 */
const LOCAL_ONLY_CHANNELS: ReadonlySet<IpcChannel> = new Set([
  IPC_CHANNELS.FILE_SELECT,
  IPC_CHANNELS.FILE_OPEN,
  IPC_CHANNELS.DB_BACKUP,
  IPC_CHANNELS.DB_BACKUP_TO_DESKTOP,
  IPC_CHANNELS.DB_RESTORE,
  IPC_CHANNELS.CREDENTIAL_SET,
  IPC_CHANNELS.CREDENTIAL_GET,
  IPC_CHANNELS.ADMIN_GET_KEY,
  IPC_CHANNELS.STOCK_SET_TOKEN,
  IPC_CHANNELS.STOCK_TEST_CONNECTION,
  IPC_CHANNELS.STOCK_SYNC_LOG,
  IPC_CHANNELS.STOCK_ADMIN,
  IPC_CHANNELS.GIPFEL_OPEN,
  IPC_CHANNELS.EXCEL_EXPORT_CONTRACTS,
  IPC_CHANNELS.EXCEL_EXPORT_REGIONS,
  IPC_CHANNELS.EXCEL_EXPORT_ACCOUNT_TRANSACTIONS
])

function resolvePath(channel: string, args: unknown[]): { method: string; path: string } {
  const entry = ROUTE_MAP[channel]
  if (!entry) throw new Error(`channel "${channel}" 没有云端映射`)

  const resolvedPath = typeof entry.path === 'function' ? entry.path(...args) : entry.path
  return { method: entry.method, path: resolvedPath }
}

export async function cloudInvoke(channel: string, ...args: unknown[]): Promise<any> {
  const entry = ROUTE_MAP[channel]
  if (!entry) {
    // P1-1 修复：云端模式无映射通道显式报错，绝不静默降级本地 IPC（防数据分叉）
    throw new Error(`该功能仅本地模式可用（云端模式不支持通道 "${channel}"），请切换本地模式后重试`)
  }
  const { method, path } = resolvePath(channel, args)

  switch (method) {
    case 'GET':
      return cloudFetch(path)
    case 'DELETE':
      return cloudFetch(path, { method: 'DELETE' })
    case 'POST':
    case 'PUT': {
      // 优先使用条目声明的 body 构造器；否则取最后一个对象参数作为 body
      const bodyArg = entry.body ? entry.body(args) : (args.length > 0 ? args[args.length - 1] : undefined)
      const body = bodyArg && typeof bodyArg === 'object' ? JSON.stringify(bodyArg) : undefined
      return cloudFetch(path, { method, body })
    }
    default:
      throw new Error(`不支持的 HTTP 方法: ${method}`)
  }
}

// ── 统一 invoke：根据云端模式自动切换 ──

export function invoke(channel: string, ...args: unknown[]): Promise<any> {
  if (isCloudMode()) {
    // P1-1 修复：云端模式下仅接受已登记的 REST 映射通道；
    // 无映射（含本地专属通道）显式抛错，不再静默降级 window.api.invoke
    if (ROUTE_MAP[channel]) {
      return cloudInvoke(channel, ...args)
    }
    const hint = LOCAL_ONLY_CHANNELS.has(channel as IpcChannel)
      ? '该功能仅本地模式可用'
      : `通道 "${channel}" 未配置云端映射`
    return Promise.reject(new Error(`${hint}，请切换本地模式后重试`))
  }
  // 本地模式：走 Electron IPC
  return window.api.invoke(channel, ...args)
}

// ══════════════════════════════════════════════════════════════
// 股票 API 方法（直接调用云端，不经过 IPC）
// ══════════════════════════════════════════════════════════════

export interface StockItem {
  symbol: string
  name: string
  price: number
  change: number
  change_percent: number
  volume?: number
  high?: number
  low?: number
  open?: number
  prev_close?: number
}

export interface OrderRequest {
  symbol: string
  side: 'buy' | 'sell'
  type?: 'buy' | 'sell'  // 兼容旧格式
  quantity: number
  shares?: number  // 兼容旧格式
  price?: number  // 限价单价格，不传则为市价单
  account_id?: number  // 资金账户 ID
}

export interface OrderItem {
  id: number
  symbol: string
  stock_name?: string
  side: string
  type?: string  // 兼容旧格式
  quantity: number
  shares?: number  // 兼容旧格式
  price: number
  status: string
  created_at: string
  filled_at?: string
}

export interface Position {
  symbol: string
  stock_name?: string
  name?: string
  shares: number
  quantity?: number
  avg_cost: number
  current_price?: number
  market_value?: number
  unrealized_pnl?: number
  pnl_percent?: number
}

export interface FundAccount {
  id: number
  name: string
  balance: number
  available?: number
  initial_balance?: number
  created_at?: string
}

export interface AccountSummary {
  total_assets: number
  available_balance: number
  total_market_value: number
  today_pnl: number
  today_pnl_percent: number
  position_count: number
}

/**
 * 获取股票行情列表
 */
export async function getStocks(): Promise<StockItem[]> {
  return cloudFetch('/market')
}

/**
 * 提交买入/卖出订单
 * 自动兼容 side/type 和 shares/quantity 字段名
 */
export async function placeOrder(order: OrderRequest): Promise<{ success: boolean; order_id?: number; message?: string }> {
  // 规范化请求体
  const body: Record<string, unknown> = {
    symbol: order.symbol,
    side: order.side || order.type || 'buy',
    shares: order.shares || order.quantity || 0,
    quantity: order.shares || order.quantity || 0,
  }
  if (order.price != null) body.price = order.price
  if (order.account_id != null) body.account_id = order.account_id
  return cloudFetch('/market/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * 获取用户订单列表
 */
export async function getOrders(): Promise<OrderItem[]> {
  return cloudFetch('/market/orders')
}

/**
 * 撤销订单
 */
export async function cancelOrder(orderId: number): Promise<{ success: boolean; message?: string }> {
  return cloudFetch(`/market/orders/${orderId}`, { method: 'DELETE' })
}

/**
 * 获取持仓列表
 */
export async function getPositions(): Promise<Position[]> {
  return cloudFetch('/market/positions')
}

/**
 * 获取资金账户列表
 */
export async function getFundAccounts(): Promise<FundAccount[]> {
  return cloudFetch('/market/accounts')
}

/**
 * 获取账户资产摘要（总资产/可用余额/今日收益/持仓数）
 */
export async function getAccountSummary(): Promise<AccountSummary> {
  return cloudFetch('/market/account/summary')
}

/**
 * 获取股票 K 线数据
 */
export async function getKline(symbol: string, period: string = '1d'): Promise<any[]> {
  return cloudFetch(`/market/kline/${symbol}?period=${period}`)
}

/**
 * 创建股票（公司上市时调用）
 */
export async function createStock(data: {
  symbol: string
  name: string
  price?: number
  sector?: string
  total_shares?: number
  revenue?: number
  industry_pe?: number
  premium_rate?: number
  carbon_price?: number
  volatility?: number
}): Promise<StockItem> {
  const result = await window.api.invoke(IPC_CHANNELS.STOCK_CREATE, data) as {
    success?: boolean
    stock?: StockItem
    message?: string
    rollbackSafe?: boolean
  }
  if (!result?.success || !result.stock) {
    const error = new Error(result?.message || '创建股票失败') as Error & { rollbackSafe?: boolean }
    error.rollbackSafe = Boolean(result?.rollbackSafe)
    throw error
  }
  return result.stock
}
