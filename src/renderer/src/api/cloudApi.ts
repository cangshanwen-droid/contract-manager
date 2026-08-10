/**
 * cloudApi.ts - 云端 API 直连模块
 * 当用户开启「云端模式」后，所有数据请求直接发往 ${CLOUD_API_BASE}
 * 否则走 Electron IPC（本地 SQLite）
 *
 * 认证：使用 Gipfel 统一登录 token（gipfel_auth_token），不再需要单独的 stock token
 */

import { CLOUD_API_BASE } from '../../../shared/cloud-config'

const API_BASE = '${CLOUD_API_BASE}'
const AUTH_TOKEN_KEY = 'gipfel_auth_token'
const CLOUD_MODE_KEY = 'cloudMode'

// ── 云端模式开关 ──

export function isCloudMode(): boolean {
  try {
    // 默认云端模式：多用户实时共享（登录走本地 IPC 直连，数据读写走云端 API）
    // 离线/无网时可在设置页手动切回本地模式
    const v = localStorage.getItem(CLOUD_MODE_KEY)
    if (v === null) return true
    return v === 'true'
  } catch {
    return true
  }
}

export function setCloudMode(v: boolean): void {
  localStorage.setItem(CLOUD_MODE_KEY, String(v))
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
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    const token = data?.token || data?.access_token || ''
    if (token) setAuthToken(token)
    return token
  } catch {
    // 网络不通时静默降级 - 不影响本地登录
    return ''
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

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`云端 API 错误 ${res.status}: ${body || res.statusText}`)
  }
  return res.json()
}

// ── 公开导出 fetch 供直接调用（股票页面使用）──

export const fetch = cloudFetch

/** 云端完整版地址（股票交易 Arena） */
export const CLOUD_ARENA_URL = '${CLOUD_API_BASE}'

/** 管理端密钥缓存（仅成功获取后缓存，未配置时不缓存以便重试） */
let cachedAdminKey: string | null = null

/**
 * 获取管理端密钥：经 IPC admin:get-key 由主进程提供
 * （环境变量 GIPFEL_ADMIN_KEY → userData/admin-key.txt），渲染进程不持有任何密钥常量。
 */
export async function getAdminKey(): Promise<string | null> {
  if (cachedAdminKey !== null) return cachedAdminKey
  try {
    const r = await window.api.invoke('admin:get-key') as { success?: boolean; key?: string } | null
    if (r?.success && r.key) {
      cachedAdminKey = r.key
      return r.key
    }
  } catch { /* 主进程不可用时返回 null */ }
  return null
}

/** 管理端监控 API 调用：带 X-Admin-Key 头（密钥来自主进程，不在渲染进程硬编码） */
export async function fetchWithAdminKey(url: string): Promise<any> {
  const key = await getAdminKey()
  if (!key) {
    throw new Error('未配置管理端密钥（请设置环境变量 GIPFEL_ADMIN_KEY 或 userData 下 admin-key.txt）')
  }
  const res = await window.fetch(url, {
    method: 'GET',
    headers: { 'X-Admin-Key': key },
    cache: 'no-store' as RequestCache,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail || `请求失败 (${res.status})`)
  }
  return res.json()
}

// ── 云端 invoke：将 IPC channel 映射到 REST ──

type PathResolver = (...args: unknown[]) => string

const ROUTE_MAP: Record<string, { method: string; path: string | PathResolver }> = {
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

  'contract:list':        { method: 'GET',    path: (regionId?: unknown) => regionId != null ? `/api/contracts?region_id=${regionId}` : '/api/contracts' },
  'contract:get':         { method: 'GET',    path: (id: unknown) => `/api/contracts/${id}` },
  'contract:create':      { method: 'POST',   path: '/api/contracts' },
  'contract:update':      { method: 'PUT',    path: (id: unknown) => `/api/contracts/${id}` },
  'contract:delete':      { method: 'DELETE', path: (id: unknown) => `/api/contracts/${id}` },
  'contract:summarize':   { method: 'GET',    path: (id: unknown) => `/api/contracts/${id}/summarize` },
  'contract:list-versions': { method: 'GET', path: (id: unknown) => `/api/contracts/${id}/versions` },

  'contract-type:list':   { method: 'GET',    path: '/api/contract-types' },

  'infra-type:list':      { method: 'GET',    path: '/api/infra-types' },

  'dashboard:summary':    { method: 'GET',    path: '/api/dashboard/summary' },

  'formula:calculate':    { method: 'POST',   path: '/api/formula/calculate' },
  'formula:log-list':     { method: 'GET',    path: (regionId: unknown) => `/api/formula/logs?region_id=${regionId}` },

  'infra-calc:load':      { method: 'GET',    path: (regionId: unknown) => `/api/infra-calc?region_id=${regionId}` },

  'auth:login':            { method: 'POST',   path: '/api/auth/login' },
  'auth:register':         { method: 'POST',   path: '/api/auth/register' },
  'auth:change-password':  { method: 'POST',   path: '/api/auth/change-password' },

  'account:summary':      { method: 'GET',    path: '/api/accounts/summary' },
  'account:list':         { method: 'GET',    path: '/api/accounts' },
  'account:get':          { method: 'GET',    path: (id: unknown) => `/api/accounts/${id}` },
  'account:create':       { method: 'POST',   path: '/api/accounts' },
  'account:transactions': { method: 'GET',    path: (id: unknown) => `/api/accounts/${id}/transactions` },
  'account:add-transaction': { method: 'POST', path: (id: unknown) => `/api/accounts/${id}/transactions` },

  'announcement:active-list': { method: 'GET', path: '/api/announcements/active' },

  'report:land-area':              { method: 'GET', path: '/api/reports/land-area' },
  'report:land-area-by-region':    { method: 'GET', path: '/api/reports/land-area-by-region' },

  'stock:get-market':             { method: 'GET', path: '/market' },
  'stock:get-quote':              { method: 'GET', path: (symbol: unknown) => `/market/quotes/${symbol}` },
  'stock:get-orders':             { method: 'GET', path: '/market/orders' },
  'stock:place-order':            { method: 'POST', path: '/market/orders' },
  'stock:cancel-order':           { method: 'DELETE', path: (id: unknown) => `/market/orders/${id}` },
  'stock:get-positions':          { method: 'GET', path: '/market/positions' },
  'stock:get-accounts':           { method: 'GET', path: '/market/accounts' },
  'stock:account-summary':        { method: 'GET', path: '/market/account/summary' },

  'announcement:create':          { method: 'POST', path: '/api/announcements' },
  'announcement:list':            { method: 'GET', path: '/api/announcements' },
  'announcement:delete':          { method: 'DELETE', path: (id: unknown) => `/api/announcements/${id}` },
  'auth:list-users':              { method: 'GET', path: '/api/auth/users' },
  'auth:create-user':             { method: 'POST', path: '/api/auth/register' },
  'auth:delete-user':             { method: 'DELETE', path: (id: unknown) => `/api/auth/users/${id}` },
  'audit:list':                   { method: 'GET', path: '/api/audit' },
  'db:backup':                    { method: 'POST', path: '/api/backup' },
  'db:auto-backup':               { method: 'GET', path: '/api/backup/auto' },
  'db:info':                      { method: 'GET', path: '/api/backup/info' },
  'excel:export':                 { method: 'GET', path: '/api/excel/export' },
  'excel:import':                 { method: 'POST', path: '/api/excel/import' },
}

function resolvePath(channel: string, args: unknown[]): { method: string; path: string } {
  const entry = ROUTE_MAP[channel]
  if (!entry) throw new Error(`channel "${channel}" 没有云端映射`)

  const resolvedPath = typeof entry.path === 'function' ? entry.path(...args) : entry.path
  return { method: entry.method, path: resolvedPath }
}

export async function cloudInvoke(channel: string, ...args: unknown[]): Promise<any> {
  const { method, path } = resolvePath(channel, args)

  switch (method) {
    case 'GET':
      return cloudFetch(path)
    case 'DELETE':
      return cloudFetch(path, { method: 'DELETE' })
    case 'POST':
    case 'PUT': {
      // 最后一个参数如果是对象，作为 body；否则 body 为空
      const bodyArg = args.length > 0 ? args[args.length - 1] : undefined
      const body = bodyArg && typeof bodyArg === 'object' ? JSON.stringify(bodyArg) : undefined
      return cloudFetch(path, { method, body })
    }
    default:
      throw new Error(`不支持的 HTTP 方法: ${method}`)
  }
}

// ── 统一 invoke：根据云端模式自动切换 ──

export function invoke(channel: string, ...args: unknown[]): Promise<any> {
  if (isCloudMode() && ROUTE_MAP[channel]) {
    return cloudInvoke(channel, ...args)
  }
  // 降级到本地 IPC
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
}): Promise<StockItem> {
  return cloudFetch('/market/stocks', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
