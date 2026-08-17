import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Tag, InputNumber, Segmented, Table, Empty, Spin, Modal, Select, Input, message } from 'antd'
import { WalletOutlined, ReloadOutlined, StarOutlined, StarFilled, SearchOutlined, LineChartOutlined, SafetyCertificateOutlined, StockOutlined } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext'
import { canTradeStocks } from '../../../shared/permissions'
import { IPC_CHANNELS } from '../../../shared/constants'
import { tokens as T } from '../styles/design-tokens'
import { CLOUD_API_BASE } from '../../../shared/cloud-config'
import ProfessionalKlineChart from '../components/stocks/ProfessionalKlineChart'
import StockAdminConsole from '../components/stocks/StockAdminConsole'
import '../styles/stock-trading.css'

/**
 * StockMarketPage v2 — 原生股票工作台（v1.3.2 用户拍板：读取股票网站代码后原生复刻，不再 iframe）
 * - 管理端/操作端：完整版（行情 + 交易 + 持仓 + 记录 + 调整可用资金）
 * - 代表端：只读股票行情面板（行情 + 资产只读，无交易）
 * 数据源：云端 stock-api（/market /portfolio /orders /adjust-balance）
 */
const STOCK_API = `${CLOUD_API_BASE}`
const MARKET_POLL_MS = 15000
const PORTFOLIO_POLL_MS = 30000

type StockQuote = { symbol: string; name: string; current_price?: number; price?: number; change_pct?: number; changePct?: number; change?: number; premium_rate?: number; carbon_price?: number; revenue?: number }
type Position = { symbol: string; name: string; shares: number; avgCost: number; currentPrice: number; marketValue: number; pnl: number; pnlRatio: number }
type Candle = { round: number; time: string; open: number; high: number; low: number; close: number; volume: number }
type OrderBook = { mode?: 'trade-distribution'; bids: { price: number; quantity: number }[]; asks: { price: number; quantity: number }[]; largeTrades: { side: string; price: number; quantity: number; created_at: string }[] }
type OrderRow = Record<string, unknown>
type FundAccount = { id: number; accountId?: number; name: string; balance: number; initialBalance?: number; locked?: boolean }

function fmtMoney(v: number | undefined | null): string {
  const n = Number(v ?? 0)
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtPct(v: number | undefined | null): string {
  const n = Number(v ?? 0)
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}
function trendColor(v: number | undefined | null): string {
  const n = Number(v ?? 0)
  return n > 0 ? '#e74c3c' : n < 0 ? '#2ecc71' : T.textMuted
}

export function StockMarketPage() {
  const user = useAuth()
  const role = user?.role || 'rep'
  const isTrader = canTradeStocks(role)
  const isAdmin = role === 'admin'

  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [market, setMarket] = useState<StockQuote[]>([])
  const [marketState, setMarketState] = useState('open')
  const [round, setRound] = useState(1)
  const [selected, setSelected] = useState('JGONG')
  const [candles, setCandles] = useState<Candle[]>([])
  const [klineLoading, setKlineLoading] = useState(false)
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null)
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('gipfel_stock_watchlist') || '[]') } catch { return [] }
  })
  const [portfolio, setPortfolio] = useState<{ user?: { balance?: number }; summary?: { marketValue?: number; totalAssets?: number; totalPnl?: number; pnlRatio?: number }; positions?: Position[]; orders?: OrderRow[]; recentTrades?: OrderRow[] } | null>(null)
  const [fundAccounts, setFundAccounts] = useState<FundAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [accountCreateOpen, setAccountCreateOpen] = useState(false)
  const [accountName, setAccountName] = useState('竞赛资金账户')
  const [accountInitialBalance, setAccountInitialBalance] = useState(100000)
  const [accountSubmitting, setAccountSubmitting] = useState(false)
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [orderShares, setOrderShares] = useState<number>(100)
  const [orderPrice, setOrderPrice] = useState<number | null>(null)
  const [orderSubmitting, setOrderSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [marketFailed, setMarketFailed] = useState(false)
  const [marketQuery, setMarketQuery] = useState('')
  const [marketScope, setMarketScope] = useState<'all' | 'watch'>('all')
  const [ledgerView, setLedgerView] = useState<'positions' | 'trades'>('positions')
  const [executionView, setExecutionView] = useState<'ticket' | 'book'>('ticket')
  const [workspaceMode, setWorkspaceMode] = useState<'chart' | 'trade'>('chart')
  const aliveRef = useRef(true)

  // 市场管理控制台（仅管理端）
  const [securityOpen, setSecurityOpen] = useState(false)

  // 调整可用资金（仅 operator/admin）
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustUsers, setAdjustUsers] = useState<{ id: number; username: string; role: string; adjustable?: number; balance?: number }[]>([])
  const [adjustUser, setAdjustUser] = useState('')
  const [adjustAmount, setAdjustAmount] = useState(0)
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustSubmitting, setAdjustSubmitting] = useState(false)

  const quotePrice = (s: StockQuote): number => Number(s.current_price ?? s.price ?? 0)
  const quotePct = (s: StockQuote): number => Number(s.change_pct ?? s.changePct ?? 0)

  // ── 登录云端 stock（safeStorage 凭据 → /auth/login → token）──
  const ensureToken = useCallback(async (): Promise<{ token: string; username: string } | null> => {
    try {
      const r = await window.api.invoke(IPC_CHANNELS.CREDENTIAL_GET) as { success?: boolean; credentials?: { username?: string; password?: string } | null } | null
      const saved = r?.success ? r.credentials : null
      if (!saved?.username || !saved?.password) return null
      const res = await fetch(`${STOCK_API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: saved.username, password: saved.password }),
      })
      if (!res.ok) throw new Error('登录失败')
      const data = await res.json()
      if (!data?.token) throw new Error('登录失败')
      return { token: data.token, username: saved.username }
    } catch {
      return null
    }
  }, [])

  // ── 行情拉取（/market 无鉴权）──
  const loadMarket = useCallback(async () => {
    try {
      const res = await fetch(`${STOCK_API}/market`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        setMarket(data)
        setMarketFailed(false)
      } else if (data?.stocks) {
        setMarket(data.stocks)
        setMarketState(data.state || 'open')
        setRound(data.round || 1)
        setMarketFailed(false)
      }
    } catch {
      setMarketFailed(true)
    }
  }, [])

  const fetchWithStockAuth = useCallback(async (
    url: string,
    init: RequestInit = {},
    tokenOverride = '',
  ): Promise<Response> => {
    const request = async (authToken: string) => {
      const headers = new Headers(init.headers)
      if (authToken) headers.set('Authorization', `Bearer ${authToken}`)
      return fetch(url, { ...init, headers })
    }
    let response = await request(tokenOverride)
    if (response.status !== 401) return response
    const renewed = await ensureToken()
    if (!renewed) return response
    setToken(renewed.token)
    setUsername(renewed.username)
    response = await request(renewed.token)
    return response
  }, [ensureToken])

  // ── K 线（公开行情，按已成交订单聚合）──
  const loadKline = useCallback(async (symbol: string) => {
    setKlineLoading(true)
    try {
      const res = await fetch(`${STOCK_API}/stocks/${encodeURIComponent(symbol)}/kline`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data)) throw new Error('K线数据格式错误')
      setCandles(data.filter((c): c is Candle => Number.isFinite(Number(c?.open)) && Number.isFinite(Number(c?.high)) && Number.isFinite(Number(c?.low)) && Number.isFinite(Number(c?.close))))
    } catch {
      setCandles([])
    } finally {
      setKlineLoading(false)
    }
  }, [])

  const loadOrderBook = useCallback(async (symbol: string) => {
    try {
      const res = await fetch(`${STOCK_API}/stocks/${encodeURIComponent(symbol)}/order-book`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data?.bids) || !Array.isArray(data?.asks) || !Array.isArray(data?.largeTrades)) throw new Error('盘口数据格式错误')
      setOrderBook(data as OrderBook)
    } catch {
      setOrderBook(null)
    }
  }, [])

  const toggleWatchlist = useCallback((symbol: string) => {
    setWatchlist((current) => {
      const next = current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]
      try { localStorage.setItem('gipfel_stock_watchlist', JSON.stringify(next)) } catch { /* 本地存储不可用时仅保留本次会话 */ }
      return next
    })
  }, [])

  const openSecurityManager = useCallback(() => {
    if (!isAdmin) return
    setSecurityOpen(true)
  }, [isAdmin])

  const loadFundAccounts = useCallback(async (tok: string, uname: string): Promise<FundAccount[]> => {
    if (!tok) return []
    try {
      const res = await fetchWithStockAuth(`${STOCK_API}/fund-accounts?username=${encodeURIComponent(uname)}`, {}, tok)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const accounts = Array.isArray(data) ? data.map((item) => ({
        id: Number(item.id ?? item.accountId), accountId: Number(item.accountId ?? item.id),
        name: String(item.name ?? item.accountName ?? '资金账户'), balance: Number(item.balance ?? item.cash ?? 0),
        initialBalance: Number(item.initialBalance ?? item.initial_balance ?? 0), locked: Boolean(item.locked),
      })).filter((item) => Number.isFinite(item.id)) : []
      setFundAccounts(accounts)
      setSelectedAccountId((current) => accounts.some((item) => item.id === current) ? current : accounts[0]?.id ?? null)
      return accounts
    } catch {
      setFundAccounts([])
      setSelectedAccountId(null)
      return []
    }
  }, [fetchWithStockAuth])

  // ── 持仓拉取（按资金账户）──
  const loadPortfolio = useCallback(async (tok: string, uname: string, accountId?: number | null) => {
    if (!tok) return
    try {
      const accountQuery = accountId ? `&account_id=${encodeURIComponent(String(accountId))}` : ''
      const res = await fetchWithStockAuth(
        `${STOCK_API}/portfolio?username=${encodeURIComponent(uname)}${accountQuery}`,
        {},
        tok,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data?.user || data?.summary) setPortfolio(data)
    } catch { /* 轮询失败静默 */ }
  }, [fetchWithStockAuth])

  // ── 挂载：登录 + 首拉行情 ──
  useEffect(() => {
    aliveRef.current = true
    ;(async () => {
      const auth = await ensureToken()
      if (!aliveRef.current) return
      if (auth) {
        setToken(auth.token)
        setUsername(auth.username)
        const accounts = await loadFundAccounts(auth.token, auth.username)
        loadPortfolio(auth.token, auth.username, accounts[0]?.id)
      }
      await loadMarket()
      await loadKline(selected)
      await loadOrderBook(selected)
      setLoading(false)
    })()
    return () => { aliveRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 行情轮询（全角色）
  useEffect(() => {
    const t = setInterval(() => { loadMarket() }, MARKET_POLL_MS)
    return () => clearInterval(t)
  }, [loadMarket])

  useEffect(() => {
    loadKline(selected)
    loadOrderBook(selected)
    const t = setInterval(() => { loadKline(selected); loadOrderBook(selected) }, PORTFOLIO_POLL_MS)
    return () => clearInterval(t)
  }, [selected, loadKline, loadOrderBook])

  // 持仓轮询（全角色；rep 只读展示资产）
  useEffect(() => {
    if (!token || !username) return
    const t = setInterval(() => { loadPortfolio(token, username, selectedAccountId) }, PORTFOLIO_POLL_MS)
    return () => clearInterval(t)
  }, [token, username, selectedAccountId, loadPortfolio])

  useEffect(() => {
    if (token && username && selectedAccountId) loadPortfolio(token, username, selectedAccountId)
  }, [token, username, selectedAccountId, loadPortfolio])

  // 选中股票联动价格
  useEffect(() => {
    const s = market.find((x) => x.symbol === selected)
    if (s) setOrderPrice(quotePrice(s))
  }, [selected, market])

  // ── 下单（/orders，仅 admin/operator）──
  const submitOrder = useCallback(async () => {
    if (!token || !username) { message.warning('请先登录'); return }
    if (!selectedAccountId) { message.warning('请先创建并选择资金账户'); return }
    const stock = market.find((s) => s.symbol === selected)
    if (!stock) { message.warning('请选择股票'); return }
    const price = orderPrice ?? quotePrice(stock)
    if (!orderShares || orderShares <= 0) { message.warning('请输入数量'); return }
    if (price <= 0) { message.warning('请输入有效价格'); return }
    const available = portfolio?.positions?.find((p) => p.symbol === selected)?.shares ?? 0
    if (orderSide === 'sell' && orderShares > available) { message.warning(`可卖数量不足，当前可卖 ${available} 股`); return }
    const availableCash = Number(portfolio?.user?.balance || 0)
    const orderTotal = orderShares * price
    if (orderSide === 'buy' && orderTotal > availableCash) { message.warning(`可用资金不足，最多可买 ${Math.floor(availableCash / price).toLocaleString('zh-CN')} 股`); return }
    const confirmed = await new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: `确认${orderSide === 'buy' ? '买入' : '卖出'} ${selected}`,
        content: <div className="gipfel-trading__order-confirm"><span>委托价格 <b>{fmtMoney(price)}</b></span><span>委托数量 <b>{orderShares.toLocaleString('zh-CN')} 股</b></span><span>预计金额 <b>{fmtMoney(orderTotal)}</b></span><small>提交后将按当前轮次立即撮合，请核对价格和数量。</small></div>,
        okText: `确认${orderSide === 'buy' ? '买入' : '卖出'}`,
        cancelText: '返回修改',
        okButtonProps: { danger: orderSide === 'sell' },
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      })
    })
    if (!confirmed) return
    setOrderSubmitting(true)
    try {
      const idem = `${orderSide}-${selected}-${username}-${Date.now()}`
      const res = await fetchWithStockAuth(`${STOCK_API}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selected, side: orderSide, quantity: orderShares, price,
          username, account_id: selectedAccountId, idempotency_key: idem,
        }),
      }, token)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.detail || '下单失败')
      message.success(`${orderSide === 'buy' ? '买入' : '卖出'}成功：${selected} ${orderShares}股 @ ¥${price}`)
      loadPortfolio(token, username, selectedAccountId)
      loadFundAccounts(token, username)
      loadMarket()
      loadKline(selected)
      loadOrderBook(selected)
    } catch (e: any) {
      message.error(e?.message || '下单失败')
    } finally {
      setOrderSubmitting(false)
    }
  }, [token, username, market, selected, orderSide, orderShares, orderPrice, portfolio, selectedAccountId, loadPortfolio, loadFundAccounts, loadMarket, loadKline, loadOrderBook, fetchWithStockAuth])

  const submitFundAccount = useCallback(async () => {
    if (!token || !username) { message.warning('股票账户尚未连接'); return }
    if (!accountName.trim()) { message.warning('请输入资金账户名称'); return }
    if (accountInitialBalance < 0) { message.warning('初始资金不能为负数'); return }
    setAccountSubmitting(true)
    try {
      const res = await fetchWithStockAuth(`${STOCK_API}/fund-accounts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, name: accountName.trim(), initial_balance: accountInitialBalance }),
      }, token)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.detail || '资金账户创建失败')
      const accounts = await loadFundAccounts(token, username)
      const createdId = Number(body?.accountId ?? body?.id)
      if (Number.isFinite(createdId) && accounts.some((item) => item.id === createdId)) setSelectedAccountId(createdId)
      setAccountCreateOpen(false)
      message.success(`资金账户“${accountName.trim()}”已创建`)
    } catch (error: any) {
      message.error(error?.message || '资金账户创建失败')
    } finally {
      setAccountSubmitting(false)
    }
  }, [accountInitialBalance, accountName, fetchWithStockAuth, loadFundAccounts, token, username])

  // ── 调整可用资金 Modal（仅 operator/admin）──
  const openAdjust = useCallback(async () => {
    if (!token) { message.warning('股票账户尚未连接，请重新登录'); return }
    setAdjustOpen(true)
    try {
      const res = await fetchWithStockAuth(`${STOCK_API}/managed-stock-accounts`, {}, token)
      const body = await res.json().catch(() => [])
      if (!res.ok) throw new Error(body?.detail || '账户目录加载失败')
      const list = Array.isArray(body) ? body : []
      setAdjustUsers(list)
      const firstAdjustable = list.find((u) => Boolean(u.adjustable))
      if (firstAdjustable && !list.find((u) => u.username === adjustUser && Boolean(u.adjustable))) {
        setAdjustUser(firstAdjustable.username)
      }
    } catch {
      setAdjustUsers([])
      message.error('股票账户目录加载失败，请稍后重试')
    }
  }, [adjustUser, token, fetchWithStockAuth])

  const submitAdjust = useCallback(async () => {
    if (!adjustUser) { message.warning('请选择用户'); return }
    if (!adjustAmount || adjustAmount === 0) { message.warning('请输入调整金额（正数=注入，负数=扣减）'); return }
    setAdjustSubmitting(true)
    try {
      const r = await window.api.invoke(IPC_CHANNELS.CREDENTIAL_GET) as { success?: boolean; credentials?: { username?: string; password?: string } | null } | null
      const saved = r?.success ? r.credentials : null
      if (!saved?.username || !saved?.password) throw new Error('登录凭据不可用，请退出后重新登录')
      const loginRes = await fetch(`${STOCK_API}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: saved.username, password: saved.password }),
      })
      if (!loginRes.ok) throw new Error('登录失败，请重新登录')
      const data = await loginRes.json()
      const tok = data?.token || ''
      if (!tok) throw new Error('登录失败，请重新登录')
      const res = await fetch(`${STOCK_API}/adjust-balance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: adjustUser, amount: adjustAmount,
          reason: adjustReason || '主席调整', idempotency_key: `adj-${adjustUser}-${Date.now()}`,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.detail || '调整失败')
      message.success(`已调整 ${adjustUser} 可用资金 ${adjustAmount > 0 ? '+' : ''}¥${adjustAmount}，当前余额 ¥${body?.balance ?? '-'}`)
      setAdjustOpen(false)
      setAdjustAmount(0)
      setAdjustReason('')
      if (adjustUser === username) {
        void loadFundAccounts(token, username).then(() => loadPortfolio(token, username, selectedAccountId))
      }
    } catch (e: any) {
      message.error(e?.message || '调整失败')
    } finally {
      setAdjustSubmitting(false)
    }
  }, [adjustUser, adjustAmount, adjustReason, token, username, selectedAccountId, loadFundAccounts, loadPortfolio])

  // ── 持仓表列 ──
  const positionColumns = [
    { title: '代码', dataIndex: 'symbol', width: 90, render: (v: string) => <span style={{ color: T.gold, fontWeight: 600 }}>{v}</span> },
    { title: '名称', dataIndex: 'name', width: 110 },
    { title: '持仓(股)', dataIndex: 'shares', width: 100, align: 'right' as const },
    { title: '成本', dataIndex: 'avgCost', width: 100, align: 'right' as const, render: (v: number) => fmtMoney(v) },
    { title: '现价', dataIndex: 'currentPrice', width: 100, align: 'right' as const, render: (v: number) => fmtMoney(v) },
    { title: '市值', dataIndex: 'marketValue', width: 110, align: 'right' as const, render: (v: number) => fmtMoney(v) },
    { title: '盈亏', dataIndex: 'pnl', width: 110, align: 'right' as const, render: (v: number) => <span style={{ color: trendColor(v) }}>{v >= 0 ? '+' : ''}{fmtMoney(v)}</span> },
    { title: '收益率', dataIndex: 'pnlRatio', width: 100, align: 'right' as const, render: (v: number) => <span style={{ color: trendColor(v) }}>{fmtPct(v)}</span> },
  ]

  const orderColumns = [
    { title: '时间', dataIndex: 'time', width: 150, render: (v: unknown) => String(v ?? '-').slice(5, 19) },
    { title: '代码', dataIndex: 'symbol', width: 80 },
    { title: '方向', dataIndex: 'side', width: 70, render: (v: string) => <Tag color={v === 'buy' ? '#e74c3c' : '#2ecc71'} style={{ margin: 0 }}>{v === 'buy' ? '买入' : v === 'sell' ? '卖出' : String(v ?? '-')}</Tag> },
    { title: '数量', dataIndex: 'quantity', width: 90, align: 'right' as const },
    { title: '价格', dataIndex: 'price', width: 100, align: 'right' as const, render: (v: unknown) => fmtMoney(Number(v ?? 0)) },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'filled' ? 'green' : v === 'pending' ? 'gold' : 'default'}>{String(v ?? '-')}</Tag> },
  ]

  const selectedStock = market.find((s) => s.symbol === selected)
  const selectedPosition = portfolio?.positions?.find((p) => p.symbol === selected)
  const selectedPrice = selectedStock ? quotePrice(selectedStock) : 0
  const selectedPct = selectedStock ? quotePct(selectedStock) : 0
  const selectedChange = Number(selectedStock?.change ?? (candles.length > 1 ? selectedPrice - candles[candles.length - 2].close : 0))
  const estimatedAmount = Math.max(0, Number(orderShares || 0) * Number(orderPrice || 0))
  const maxOrderShares = orderSide === 'sell'
    ? Number(selectedPosition?.shares || 0)
    : Math.max(0, Math.floor(Number(portfolio?.user?.balance || 0) / Math.max(Number(orderPrice || selectedPrice), 0.01)))
  const filteredMarket = market.filter((stock) => {
    if (marketScope === 'watch' && !watchlist.includes(stock.symbol)) return false
    const query = marketQuery.trim().toLowerCase()
    return !query || stock.symbol.toLowerCase().includes(query) || stock.name.toLowerCase().includes(query)
  })
  const rankedMarket = [...market].sort((a, b) => quotePct(b) - quotePct(a))

  return (
    <div className="gipfel-trading page-fade-in">
      <header className="gipfel-trading__header">
        <div className="gipfel-trading__instrument">
          <div className="gipfel-trading__identity">
            <span className="gipfel-trading__symbol">{selectedStock?.symbol || selected}</span>
            <strong>{selectedStock?.name || '选择一只股票'}</strong>
            <button
              className="gipfel-trading__watch"
              onClick={() => toggleWatchlist(selected)}
              aria-label={watchlist.includes(selected) ? `取消自选 ${selected}` : `加入自选 ${selected}`}
            >
              {watchlist.includes(selected) ? <StarFilled /> : <StarOutlined />}
            </button>
          </div>
          <div className="gipfel-trading__price" style={{ color: trendColor(selectedPct) }}>
            {selectedStock ? fmtMoney(selectedPrice) : '--'}
          </div>
          <div className="gipfel-trading__change" style={{ color: trendColor(selectedPct) }}>
            {selectedStock ? `${selectedChange >= 0 ? '+' : ''}${selectedChange.toFixed(2)}  ${fmtPct(selectedPct)}` : '--'}
          </div>
        </div>

        <div className="gipfel-trading__status" aria-label="市场状态">
          <span className={`gipfel-trading__live-dot ${marketState === 'open' ? 'is-open' : 'is-closed'}`} />
          <div><b>{marketState === 'open' ? '交易中' : '已收盘'}</b><span>第 {round} 轮</span></div>
          <button className="gipfel-trading__refresh" onClick={() => { loadMarket(); loadKline(selected); loadOrderBook(selected) }} aria-label="刷新行情">
            <ReloadOutlined />
          </button>
          {isTrader && (
            <Button className="gipfel-trading__fund-action" size="small" icon={<WalletOutlined />} onClick={openAdjust}>资金调度</Button>
          )}
          {isAdmin && (
            <Button className="gipfel-trading__security-action" size="small" icon={<SafetyCertificateOutlined />} onClick={openSecurityManager}>市场管理</Button>
          )}
        </div>
      </header>

      <section className="gipfel-trading__account-rail" aria-label="账户资产">
        {!token ? (
          <div className="gipfel-trading__account-offline"><SafetyCertificateOutlined /><span><strong>交易账户未连接</strong><small>行情浏览正常；退出后重新登录即可恢复资产与委托功能</small></span><b>{isTrader ? role === 'admin' ? '管理端' : '操作端' : '只读行情'}</b></div>
        ) : !portfolio ? (
          <div className="gipfel-trading__account-offline"><Spin size="small" /><span><strong>正在同步账户资产</strong><small>{username}</small></span></div>
        ) : (
          <>
            <div className="gipfel-trading__account-selector">
              <span>资金账户</span>
              <div><Select
                size="small"
                value={selectedAccountId ?? undefined}
                placeholder="选择资金账户"
                onChange={setSelectedAccountId}
                options={fundAccounts.map((account) => ({ value: account.id, label: `${account.name} · ${fmtMoney(account.balance)}` }))}
                notFoundContent="暂无资金账户"
              />{isTrader && <button onClick={() => setAccountCreateOpen(true)} aria-label="创建资金账户">+</button>}</div>
            </div>
            <div className="is-primary"><span>总资产</span><strong>{fmtMoney(portfolio.summary?.totalAssets)}</strong><small>{username}</small></div>
            <div><span>可用资金</span><strong>{fmtMoney(portfolio.user?.balance)}</strong></div>
            <div><span>持仓市值</span><strong>{fmtMoney(portfolio.summary?.marketValue)}</strong></div>
            <div><span>浮动盈亏</span><strong style={{ color: trendColor(portfolio.summary?.totalPnl) }}>{fmtMoney(portfolio.summary?.totalPnl)}</strong><small style={{ color: trendColor(portfolio.summary?.pnlRatio) }}>{fmtPct(portfolio.summary?.pnlRatio)}</small></div>
            <div className="gipfel-trading__access-mode"><span>权限模式</span><strong>{isTrader ? role === 'admin' ? '管理端' : '操作端' : '只读行情'}</strong><small>{isTrader ? '交易已启用' : '无买卖入口'}</small></div>
          </>
        )}
      </section>

      <div className="gipfel-trading__modebar" role="group" aria-label="股票工作区视图">
        <div>
          <button className={workspaceMode === 'chart' ? 'is-active' : ''} aria-pressed={workspaceMode === 'chart'} onClick={() => setWorkspaceMode('chart')}><LineChartOutlined /> 专业图表</button>
          {isTrader && <button className={workspaceMode === 'trade' ? 'is-active' : ''} aria-pressed={workspaceMode === 'trade'} onClick={() => setWorkspaceMode('trade')}><StockOutlined /> 交易工作台</button>}
        </div>
        <span>{workspaceMode === 'chart' ? '全宽行情研判 · 滚轮缩放 · 拖动平移' : '行情、图表、委托联动操作'}</span>
      </div>

      {loading ? (
        <div className="gipfel-trading__state"><div className="gipfel-trading__loading"><Spin /><span>正在连接交易市场</span></div></div>
      ) : marketFailed ? (
        <div className="gipfel-trading__state">
          <Empty description="行情连接失败，请检查网络后重试">
            <Button icon={<ReloadOutlined />} onClick={() => { setLoading(true); loadMarket().finally(() => setLoading(false)) }}>重试</Button>
          </Empty>
        </div>
      ) : (
        <>
          <section className={`gipfel-trading__workbench ${!isTrader ? 'is-readonly' : ''} ${workspaceMode === 'chart' ? 'is-chart-focus' : 'is-trade-mode'}`}>
            <aside className="gipfel-trading__tape" aria-label="股票行情列表">
              <div className="gipfel-trading__panel-head">
                <div><strong>市场行情</strong><span>{market.length} 只 · 15 秒同步</span></div>
                <div className="gipfel-trading__panel-actions">
                  <LineChartOutlined />
                </div>
              </div>
              <Input
                className="gipfel-trading__search"
                prefix={<SearchOutlined />}
                value={marketQuery}
                onChange={(event) => setMarketQuery(event.target.value)}
                placeholder="代码 / 公司"
                aria-label="搜索股票代码或公司名称"
                allowClear
              />
              <div className="gipfel-trading__scope" role="group" aria-label="行情范围">
                <button aria-pressed={marketScope === 'all'} className={marketScope === 'all' ? 'is-active' : ''} onClick={() => setMarketScope('all')}>全部</button>
                <button aria-pressed={marketScope === 'watch'} className={marketScope === 'watch' ? 'is-active' : ''} onClick={() => setMarketScope('watch')}>自选 {watchlist.length || ''}</button>
              </div>
              <div className="gipfel-trading__tape-head"><span>标的</span><span>最新</span><span>涨跌幅</span></div>
              <div className="gipfel-trading__quotes">
                {filteredMarket.map((s) => {
                  const price = quotePrice(s)
                  const pct = quotePct(s)
                  const active = s.symbol === selected
                  return (
                    <button
                      key={s.symbol}
                      onClick={() => setSelected(s.symbol)}
                      className={`gipfel-trading__quote ${active ? 'is-active' : ''}`}
                      aria-pressed={active}
                    >
                      <span className="gipfel-trading__quote-name"><b>{s.symbol}</b><small>{s.name}</small></span>
                      <span className="gipfel-trading__quote-price">{price.toFixed(2)}</span>
                      <span style={{ color: trendColor(pct) }}>{fmtPct(pct)}</span>
                    </button>
                  )
                })}
                {!filteredMarket.length && <div className="gipfel-trading__empty-list">未找到匹配股票</div>}
              </div>
            </aside>

            <main className="gipfel-trading__chart-panel">
              {workspaceMode === 'chart' && <div className="gipfel-trading__symbol-strip" aria-label="股票快速切换">
                {market.map((stock) => {
                  const pct = quotePct(stock)
                  return <button key={stock.symbol} className={selected === stock.symbol ? 'is-active' : ''} aria-pressed={selected === stock.symbol} onClick={() => setSelected(stock.symbol)}>
                    <span><b>{stock.symbol}</b><small>{stock.name}</small></span>
                    <strong>{quotePrice(stock).toFixed(2)}</strong>
                    <em style={{ color: trendColor(pct) }}>{fmtPct(pct)}</em>
                  </button>
                })}
              </div>}
              <div className="gipfel-trading__chart-head">
                <div><strong>轮次 K 线</strong><span>每轮一根真实蜡烛 · 30 秒同步</span></div>
                <div className="gipfel-trading__fundamentals" aria-label="股票区域基础指标">
                  <span>幸福度 <b>{selectedStock?.premium_rate != null ? Number(selectedStock.premium_rate).toFixed(2) : '--'}</b></span>
                  <span>碳排放 <b>{selectedStock?.carbon_price != null ? Number(selectedStock.carbon_price).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '--'}</b></span>
                  <small>区域同步值 · 下次收盘参与定价</small>
                </div>
                <div className="gipfel-trading__legend"><span className="is-up">上涨</span><span className="is-down">下跌</span><span className="is-ma5">MA5</span><span className="is-ma10">MA10</span><span>十字光标查看 OHLC</span></div>
              </div>
              <ProfessionalKlineChart candles={candles} loading={klineLoading} symbol={selected} />
              <div className="gipfel-trading__market-insight">
                <div><span>涨幅领先</span><strong>{rankedMarket[0]?.symbol || '--'}</strong><b className="is-up">{rankedMarket[0] ? fmtPct(quotePct(rankedMarket[0])) : '--'}</b></div>
                <div><span>跌幅领先</span><strong>{rankedMarket[rankedMarket.length - 1]?.symbol || '--'}</strong><b className="is-down">{rankedMarket.length ? fmtPct(quotePct(rankedMarket[rankedMarket.length - 1])) : '--'}</b></div>
                <div><span>大单监测</span><strong>{orderBook?.largeTrades?.length ?? 0} 笔</strong><b>阈值 1,000 股</b></div>
              </div>
            </main>

            <aside className="gipfel-trading__execution">
              {isTrader && (
                <div className="gipfel-trading__execution-tabs" role="tablist" aria-label="交易工具">
                  <button role="tab" aria-selected={executionView === 'ticket'} className={executionView === 'ticket' ? 'is-active' : ''} onClick={() => setExecutionView('ticket')}>委托</button>
                  <button role="tab" aria-selected={executionView === 'book'} className={executionView === 'book' ? 'is-active' : ''} onClick={() => setExecutionView('book')}>盘口</button>
                </div>
              )}
              {isTrader && executionView === 'ticket' ? (
                <>
                <section className="gipfel-trading__ticket">
                  <div className="gipfel-trading__panel-head"><div><strong>委托下单</strong><span>限价撮合 · {selected}</span></div><SafetyCertificateOutlined /></div>
                  <Segmented
                    className={`gipfel-trading__side-switch is-${orderSide}`}
                    block
                    disabled={!token || marketState !== 'open'}
                    value={orderSide}
                    onChange={(value) => setOrderSide(value as 'buy' | 'sell')}
                    options={[{ label: '买入', value: 'buy' }, { label: '卖出', value: 'sell' }]}
                  />
                  {!token && <div className="gipfel-trading__connection-note">交易账户未连接。退出后重新登录即可恢复委托权限。</div>}
                  <div className="gipfel-trading__field-grid">
                    <label className="gipfel-trading__field"><span>价格（元）</span><InputNumber disabled={!token || marketState !== 'open'} min={0.01} step={0.01} precision={2} prefix="¥" value={orderPrice} onChange={setOrderPrice} /></label>
                    <label className="gipfel-trading__field"><span>数量（股）</span><InputNumber disabled={!token || marketState !== 'open'} min={1} max={orderSide === 'sell' ? selectedPosition?.shares : 1000000} precision={0} value={orderShares} onChange={(value) => setOrderShares(value ?? 0)} /></label>
                  </div>
                  <div className="gipfel-trading__quick-size">
                    {[100, 500, 1000].map((size) => <button key={size} disabled={!token || marketState !== 'open' || size > maxOrderShares} onClick={() => setOrderShares(size)}>{size.toLocaleString('zh-CN')}</button>)}
                    <button disabled={!token || marketState !== 'open' || maxOrderShares <= 0} onClick={() => setOrderShares(maxOrderShares)}>最大</button>
                  </div>
                  <dl className="gipfel-trading__order-summary">
                    <div><dt>{orderSide === 'buy' ? '可买数量' : '可卖数量'}</dt><dd>{maxOrderShares.toLocaleString('zh-CN')} 股</dd></div>
                    <div><dt>预计金额</dt><dd>{fmtMoney(estimatedAmount)}</dd></div>
                    <div><dt>可用资金</dt><dd>{fmtMoney(portfolio?.user?.balance)}</dd></div>
                  </dl>
                  <Button
                    className={`gipfel-trading__submit is-${orderSide}`}
                    block
                    icon={<StockOutlined />}
                    loading={orderSubmitting}
                    disabled={marketState !== 'open' || !token}
                    onClick={submitOrder}
                  >
                    {marketState !== 'open' ? '市场已收盘' : !token ? '账户未连接' : `提交${orderSide === 'buy' ? '买入' : '卖出'}委托`}
                  </Button>
                </section>
                <section className="gipfel-trading__depth-snapshot">
                  <div className="gipfel-trading__depth-snapshot-head"><span>盘口快照</span><button onClick={() => setExecutionView('book')}>查看完整五档</button></div>
                  <div className="gipfel-trading__depth-snapshot-row is-ask"><span>卖一</span><b>{orderBook?.asks?.[0] ? orderBook.asks[0].price.toFixed(2) : '--'}</b><span>{orderBook?.asks?.[0] ? Number(orderBook.asks[0].quantity).toLocaleString('zh-CN') : '--'}</span></div>
                  <div className="gipfel-trading__depth-snapshot-mid" style={{ color: trendColor(selectedPct) }}><strong>{selectedPrice.toFixed(2)}</strong><span>{fmtPct(selectedPct)}</span></div>
                  <div className="gipfel-trading__depth-snapshot-row is-bid"><span>买一</span><b>{orderBook?.bids?.[0] ? orderBook.bids[0].price.toFixed(2) : '--'}</b><span>{orderBook?.bids?.[0] ? Number(orderBook.bids[0].quantity).toLocaleString('zh-CN') : '--'}</span></div>
                </section>
                </>
              ) : !isTrader ? (
                <section className="gipfel-trading__readonly">
                  <SafetyCertificateOutlined />
                  <strong>只读行情模式</strong>
                  <p>代表端可以查看行情、K 线和个人持仓，不显示任何买卖或资金操作入口。</p>
                </section>
              ) : null}

              {(!isTrader || executionView === 'book') && <section className="gipfel-trading__book">
                <div className="gipfel-trading__panel-head"><div><strong>{orderBook?.mode === 'trade-distribution' ? '成交价位分布' : '五档盘口'}</strong><span>{orderBook?.mode === 'trade-distribution' ? '历史成交聚合，非实时挂单' : '实时委托'}</span></div><span className="gipfel-trading__spread">现价 {selectedPrice.toFixed(2)}</span></div>
                <div className="gipfel-trading__book-head"><span>档位</span><span>价格</span><span>数量</span></div>
                <div className="gipfel-trading__levels is-ask">
                  {Array.from({ length: 5 }, (_, index) => orderBook?.asks[4 - index]).map((level, index) => <div key={`ask-${index}`}><span>卖 {5 - index}</span><b>{level ? level.price.toFixed(2) : '--'}</b><span>{level ? Number(level.quantity).toLocaleString('zh-CN') : '--'}</span></div>)}
                </div>
                <div className="gipfel-trading__mid-price" style={{ color: trendColor(selectedPct) }}><strong>{selectedPrice ? selectedPrice.toFixed(2) : '--'}</strong><span>{fmtPct(selectedPct)}</span></div>
                <div className="gipfel-trading__levels is-bid">
                  {Array.from({ length: 5 }, (_, index) => orderBook?.bids[index]).map((level, index) => <div key={`bid-${index}`}><span>买 {index + 1}</span><b>{level ? level.price.toFixed(2) : '--'}</b><span>{level ? Number(level.quantity).toLocaleString('zh-CN') : '--'}</span></div>)}
                </div>
              </section>}
            </aside>
          </section>

          <section className="gipfel-trading__ledger">
            <div className="gipfel-trading__ledger-tabs" role="tablist" aria-label="账户明细">
              <button id="positions-tab" role="tab" aria-controls="ledger-panel" aria-selected={ledgerView === 'positions'} className={ledgerView === 'positions' ? 'is-active' : ''} onClick={() => setLedgerView('positions')}>持仓资产 <span>{portfolio?.positions?.length ?? 0}</span></button>
              <button id="trades-tab" role="tab" aria-controls="ledger-panel" aria-selected={ledgerView === 'trades'} className={ledgerView === 'trades' ? 'is-active' : ''} onClick={() => setLedgerView('trades')}>最近成交 <span>{portfolio?.recentTrades?.length ?? 0}</span></button>
            </div>
            <div id="ledger-panel" role="tabpanel" aria-labelledby={`${ledgerView}-tab`} className="gipfel-trading__table-wrap">
              {ledgerView === 'positions' ? (
                (portfolio?.positions?.length ?? 0) > 0
                  ? <Table size="small" rowKey="symbol" columns={positionColumns as any} dataSource={portfolio!.positions!} pagination={false} />
                  : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无持仓记录" />
              ) : (
                (portfolio?.recentTrades?.length ?? 0) > 0
                  ? <Table size="small" rowKey={(_, index) => String(index ?? 0)} columns={orderColumns as any} dataSource={portfolio!.recentTrades!} pagination={false} />
                  : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成交记录" />
              )}
            </div>
          </section>
        </>
      )}

      <Modal
        title="创建资金账户"
        open={accountCreateOpen}
        onCancel={() => setAccountCreateOpen(false)}
        onOk={() => void submitFundAccount()}
        okText="创建并锁定"
        cancelText="取消"
        confirmLoading={accountSubmitting}
      >
        <div className="gipfel-trading__account-form">
          <label><span>账户名称</span><Input value={accountName} maxLength={60} onChange={(event) => setAccountName(event.target.value)} placeholder="例如：第一轮竞赛账户" /></label>
          <label><span>初始资金</span><InputNumber value={accountInitialBalance} min={0} precision={2} prefix="¥" onChange={(value) => setAccountInitialBalance(value ?? 0)} /></label>
          <p>资金账户创建后用于股票买卖和持仓核算，与合同、区域及基础设施资金完全隔离。</p>
        </div>
      </Modal>

      {/* ── 调整可用资金 Modal（仅 operator/admin）── */}
      <Modal
        title="调整可用资金"
        open={adjustOpen}
        onCancel={() => setAdjustOpen(false)}
        onOk={submitAdjust}
        okText="调整"
        confirmLoading={adjustSubmitting}
        okButtonProps={{ style: { background: T.gold, borderColor: T.gold } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 4 }}>选择用户</div>
            <Select
              style={{ width: '100%' }}
              value={adjustUser || undefined}
              placeholder="选择用户"
              onChange={setAdjustUser}
              options={adjustUsers.map((u) => ({
                value: u.username,
                disabled: !Boolean(u.adjustable),
                label: `${u.username}（${u.role === 'rep' ? '代表' : u.role === 'admin' ? '管理' : '操作'}${u.adjustable ? '' : ' · 资金锁定'}）`,
              }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 4 }}>调整金额（正数=注入，负数=扣减）</div>
            <InputNumber style={{ width: '100%' }} value={adjustAmount} onChange={(v) => setAdjustAmount(v ?? 0)} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 4 }}>原因说明</div>
            <input
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, color: T.textPrimary, fontSize: 13 }}
              placeholder="如：季度注资 / 主席审计"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
            />
          </div>
          <div style={{ fontSize: 11, color: T.textMuted }}>
            仅代表账户（可修改）可调整；主席审计账户 100 万锁定不可调
          </div>
        </div>
      </Modal>

      {isAdmin && <StockAdminConsole
        open={securityOpen}
        onClose={() => setSecurityOpen(false)}
        onMarketChanged={() => {
          void loadMarket()
          void loadKline(selected)
          void loadOrderBook(selected)
          if (token && username) void loadFundAccounts(token, username).then((accounts) => loadPortfolio(token, username, accounts[0]?.id))
        }}
        onOpenFunds={() => {
          setSecurityOpen(false)
          void openAdjust()
        }}
      />}
    </div>
  )
}

export default StockMarketPage
