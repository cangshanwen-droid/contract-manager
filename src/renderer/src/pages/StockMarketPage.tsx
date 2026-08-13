import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Card, Button, Tag, Space, InputNumber, Segmented, Table, Empty, Spin, Modal, Select, message } from 'antd'
import { WalletOutlined, ReloadOutlined, SwapOutlined, RiseOutlined, FallOutlined, StarOutlined, StarFilled } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext'
import { canTradeStocks } from '../../../shared/permissions'
import { IPC_CHANNELS } from '../../../shared/constants'
import { invoke } from '../api/cloudApi'
import { tokens as T } from '../styles/design-tokens'
import { CLOUD_API_BASE } from '../../../shared/cloud-config'

/**
 * StockMarketPage v2 — 原生股票工作台（v1.3.2 用户拍板：读取股票网站代码后原生复刻，不再 iframe）
 * - 管理端/操作端：完整版（行情 + 交易 + 持仓 + 记录 + 调整可用资金）
 * - 代表端：只读股票行情面板（行情 + 资产只读，无交易）
 * 数据源：云端 stock-api（/market /portfolio /orders /adjust-balance）
 */
const STOCK_API = `${CLOUD_API_BASE}`
const MARKET_POLL_MS = 15000
const PORTFOLIO_POLL_MS = 30000

type StockQuote = { symbol: string; name: string; current_price?: number; price?: number; change_pct?: number; changePct?: number; change?: number }
type Position = { symbol: string; name: string; shares: number; avgCost: number; currentPrice: number; marketValue: number; pnl: number; pnlRatio: number }
type Candle = { round: number; time: string; open: number; high: number; low: number; close: number; volume: number }
type OrderBook = { bids: { price: number; quantity: number }[]; asks: { price: number; quantity: number }[]; largeTrades: { side: string; price: number; quantity: number; created_at: string }[] }
type OrderRow = Record<string, unknown>

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

function KlinePanel({ candles, loading }: { candles: Candle[]; loading: boolean }) {
  if (loading) return <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="small" tip="K线加载中…" /></div>
  if (!candles.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 K 线数据" />
  const high = Math.max(...candles.map((c) => c.high))
  const low = Math.min(...candles.map((c) => c.low))
  const range = Math.max(high - low, high * 0.02, 1)
  const upper = high + range * 0.12
  const lower = low - range * 0.12
  const y = (price: number) => 18 + ((upper - price) / (upper - lower)) * 188
  const step = 680 / candles.length
  const bodyWidth = Math.max(3, Math.min(14, step * 0.58))
  const latest = candles[candles.length - 1]

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8, fontSize: 12, color: T.textMuted }}>
        <span>开 <strong style={{ color: T.textPrimary }}>{latest.open.toFixed(2)}</strong></span>
        <span>高 <strong style={{ color: '#e74c3c' }}>{latest.high.toFixed(2)}</strong></span>
        <span>低 <strong style={{ color: '#2ecc71' }}>{latest.low.toFixed(2)}</strong></span>
        <span>收 <strong style={{ color: trendColor(latest.close - latest.open) }}>{latest.close.toFixed(2)}</strong></span>
        <span>成交量 <strong style={{ color: T.textPrimary }}>{latest.volume.toLocaleString('zh-CN')}</strong></span>
      </div>
      <svg viewBox="0 0 720 238" role="img" aria-label="股票 K 线图" style={{ width: '100%', height: 238, display: 'block', background: '#061A33', border: `1px solid ${T.border}` }}>
        {[18, 80, 142, 206].map((line) => <line key={line} x1="28" x2="708" y1={line} y2={line} stroke={T.border} strokeWidth="1" />)}
        <text x="4" y="22" fill={T.textMuted} fontSize="11">{upper.toFixed(2)}</text>
        <text x="4" y="210" fill={T.textMuted} fontSize="11">{lower.toFixed(2)}</text>
        {candles.map((c, index) => {
          const x = 28 + step * index + step / 2
          const rising = c.close >= c.open
          const color = rising ? '#e74c3c' : '#2ecc71'
          const openY = y(c.open)
          const closeY = y(c.close)
          return <g key={`${c.time}-${c.round}`}>
            <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1.5" />
            <rect x={x - bodyWidth / 2} y={Math.min(openY, closeY)} width={bodyWidth} height={Math.max(2, Math.abs(closeY - openY))} fill={color} />
          </g>
        })}
        <text x="28" y="228" fill={T.textMuted} fontSize="11">{candles[0].time.slice(0, 10)}</text>
        <text x="620" y="228" fill={T.textMuted} fontSize="11">{latest.time.slice(0, 10)}</text>
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: T.textMuted }}><span><i style={{ display: 'inline-block', width: 8, height: 8, background: '#e74c3c', marginRight: 4 }} />上涨</span><span><i style={{ display: 'inline-block', width: 8, height: 8, background: '#2ecc71', marginRight: 4 }} />下跌</span><span>数据按已成交订单聚合</span></div>
    </div>
  )
}

export function StockMarketPage() {
  const user = useAuth()
  const role = user?.role || 'rep'
  const isTrader = canTradeStocks(role)

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
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [orderShares, setOrderShares] = useState<number>(100)
  const [orderPrice, setOrderPrice] = useState<number | null>(null)
  const [orderSubmitting, setOrderSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [marketFailed, setMarketFailed] = useState(false)
  const aliveRef = useRef(true)

  // 调整可用资金（仅 operator/admin）
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustUsers, setAdjustUsers] = useState<{ id: number; username: string; role: string }[]>([])
  const [adjustUser, setAdjustUser] = useState('')
  const [adjustAmount, setAdjustAmount] = useState(0)
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustSubmitting, setAdjustSubmitting] = useState(false)

  const quotePrice = (s: StockQuote): number => Number(s.current_price ?? s.price ?? 0)
  const quotePct = (s: StockQuote): number => Number(s.change_pct ?? s.changePct ?? 0)

  // ── 登录云端 stock（safeStorage 凭据 → /auth/login → token）──
  const ensureToken = useCallback(async (): Promise<{ token: string; username: string } | null> => {
    try {
      const r = await invoke(IPC_CHANNELS.CREDENTIAL_GET) as { success?: boolean; credentials?: { username?: string; password?: string } | null } | null
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

  // ── 持仓拉取（/portfolio?username= 需 token）──
  const loadPortfolio = useCallback(async (tok: string, uname: string) => {
    if (!tok) return
    try {
      const res = await fetch(`${STOCK_API}/portfolio?username=${encodeURIComponent(uname)}`, {
        headers: { Authorization: `Bearer ${tok}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data?.user || data?.summary) setPortfolio(data)
    } catch { /* 轮询失败静默 */ }
  }, [])

  // ── 挂载：登录 + 首拉行情 ──
  useEffect(() => {
    aliveRef.current = true
    ;(async () => {
      const auth = await ensureToken()
      if (!aliveRef.current) return
      if (auth) {
        setToken(auth.token)
        setUsername(auth.username)
        loadPortfolio(auth.token, auth.username)
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
    const t = setInterval(() => { loadPortfolio(token, username) }, PORTFOLIO_POLL_MS)
    return () => clearInterval(t)
  }, [token, username, loadPortfolio])

  // 选中股票联动价格
  useEffect(() => {
    const s = market.find((x) => x.symbol === selected)
    if (s) setOrderPrice(quotePrice(s))
  }, [selected, market])

  // ── 下单（/orders，仅 admin/operator）──
  const submitOrder = useCallback(async () => {
    if (!token || !username) { message.warning('请先登录'); return }
    const stock = market.find((s) => s.symbol === selected)
    if (!stock) { message.warning('请选择股票'); return }
    const price = orderPrice ?? quotePrice(stock)
    if (!orderShares || orderShares <= 0) { message.warning('请输入数量'); return }
    if (price <= 0) { message.warning('请输入有效价格'); return }
    const available = portfolio?.positions?.find((p) => p.symbol === selected)?.shares ?? 0
    if (orderSide === 'sell' && orderShares > available) { message.warning(`可卖数量不足，当前可卖 ${available} 股`); return }
    setOrderSubmitting(true)
    try {
      const idem = `${orderSide}-${selected}-${username}-${Date.now()}`
      const res = await fetch(`${STOCK_API}/orders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selected, side: orderSide, quantity: orderShares, price,
          username, idempotency_key: idem,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.detail || '下单失败')
      message.success(`${orderSide === 'buy' ? '买入' : '卖出'}成功：${selected} ${orderShares}股 @ ¥${price}`)
      loadPortfolio(token, username)
      loadMarket()
      loadKline(selected)
      loadOrderBook(selected)
    } catch (e: any) {
      message.error(e?.message || '下单失败')
    } finally {
      setOrderSubmitting(false)
    }
  }, [token, username, market, selected, orderSide, orderShares, orderPrice, portfolio, loadPortfolio, loadMarket, loadKline, loadOrderBook])

  // ── 调整可用资金 Modal（仅 operator/admin）──
  const openAdjust = useCallback(async () => {
    setAdjustOpen(true)
    try {
      const r = await invoke(IPC_CHANNELS.AUTH_LIST_USERS) as any
      const list = Array.isArray(r) ? r : ((r?.users && Array.isArray(r.users)) ? r.users : [])
      setAdjustUsers(list as { id: number; username: string; role: string }[])
      if (list.length > 0 && !list.find((u: any) => u.username === adjustUser)) {
        setAdjustUser(list[0].username)
      }
    } catch {
      setAdjustUsers([])
    }
  }, [adjustUser])

  const submitAdjust = useCallback(async () => {
    if (!adjustUser) { message.warning('请选择用户'); return }
    if (!adjustAmount || adjustAmount === 0) { message.warning('请输入调整金额（正数=注入，负数=扣减）'); return }
    setAdjustSubmitting(true)
    try {
      const r = await invoke(IPC_CHANNELS.CREDENTIAL_GET) as { success?: boolean; credentials?: { username?: string; password?: string } | null } | null
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
      if (adjustUser === username) loadPortfolio(token, username)
    } catch (e: any) {
      message.error(e?.message || '调整失败')
    } finally {
      setAdjustSubmitting(false)
    }
  }, [adjustUser, adjustAmount, adjustReason, token, username, loadPortfolio])

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

  return (
    <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 4px' }}>
      {/* ── 顶部资产条（全角色）── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Card size="small" style={{ flex: 1, minWidth: 160, background: T.cardBg, borderColor: T.border }}>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 4 }}>可用资金</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.gold }}>{fmtMoney(portfolio?.user?.balance)}</div>
        </Card>
        <Card size="small" style={{ flex: 1, minWidth: 160, background: T.cardBg, borderColor: T.border }}>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 4 }}>持仓市值</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary }}>{fmtMoney(portfolio?.summary?.marketValue)}</div>
        </Card>
        <Card size="small" style={{ flex: 1, minWidth: 160, background: T.cardBg, borderColor: T.border }}>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 4 }}>总资产</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary }}>{fmtMoney(portfolio?.summary?.totalAssets)}</div>
        </Card>
        <Card size="small" style={{ minWidth: 180, background: T.cardBg, borderColor: T.border, display: 'flex', alignItems: 'center' }}>
          <Space direction="vertical" size={2}>
            <span style={{ fontSize: 12, color: T.textMuted }}>市场状态</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: marketState === 'open' ? '#2ecc71' : '#e74c3c' }}>
              {marketState === 'open' ? '交易中' : '已收盘'} · 第{round}轮
            </span>
          </Space>
          {isTrader && (
            <Button size="small" icon={<WalletOutlined />} style={{ marginLeft: 12 }} onClick={openAdjust}>
              调整可用资金
            </Button>
          )}
        </Card>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin tip="行情加载中…" /></div>
      ) : marketFailed ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Empty description="行情连接失败，请检查网络后重试">
            <Button icon={<ReloadOutlined />} onClick={() => { setLoading(true); loadMarket().finally(() => setLoading(false)) }}>重试</Button>
          </Empty>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
            {/* ── 左：行情列表（全角色）── */}
            <Card size="small" style={{ width: 260, background: T.cardBg, borderColor: T.border, flexShrink: 0 }} title={<span style={{ fontSize: 13, color: T.textPrimary }}>股票行情</span>} extra={<span style={{ fontSize: 11, color: T.textMuted }}>15s 刷新</span>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {market.map((s) => {
                  const price = quotePrice(s)
                  const pct = quotePct(s)
                  const active = s.symbol === selected
                  return (
                    <div
                      key={s.symbol}
                      onClick={() => setSelected(s.symbol)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                        background: active ? 'rgba(201,162,39,0.10)' : 'transparent',
                        border: active ? `1px solid ${T.gold}40` : `1px solid transparent`,
                        transition: 'all .2s',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: active ? T.gold : T.textPrimary }}>
                          <button onClick={(event) => { event.stopPropagation(); toggleWatchlist(s.symbol) }} aria-label={`${watchlist.includes(s.symbol) ? '取消自选' : '加入自选'} ${s.symbol}`} style={{ padding: 0, marginRight: 5, border: 0, background: 'transparent', color: watchlist.includes(s.symbol) ? T.gold : T.textMuted, cursor: 'pointer' }}>
                            {watchlist.includes(s.symbol) ? <StarFilled /> : <StarOutlined />}
                          </button>{s.symbol}
                        </div>
                        <div style={{ fontSize: 11, color: T.textMuted }}>{s.name}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: trendColor(pct) }}>{price.toFixed(2)}</div>
                        <div style={{ fontSize: 11, color: trendColor(pct) }}>{fmtPct(pct)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* ── 右：选中股票详情 + 交易（交易仅 admin/operator）── */}
            <Card size="small" style={{ flex: 1, background: T.cardBg, borderColor: T.border }} title={
              <span style={{ fontSize: 13, color: T.textPrimary }}>
                {selectedStock ? `${selectedStock.symbol} · ${selectedStock.name}` : selected}
                {selectedStock && <Tag color={quotePct(selectedStock) >= 0 ? '#e74c3c' : '#2ecc71'} style={{ marginLeft: 10 }}>{fmtPct(quotePct(selectedStock))}</Tag>}
              </span>
            } extra={
              <Space size={4}>
                <Button size="small" icon={<ReloadOutlined />} onClick={() => loadMarket()} />
                <Button size="small" icon={watchlist.includes(selected) ? <StarFilled /> : <StarOutlined />} aria-label={watchlist.includes(selected) ? '取消自选' : '加入自选'} style={{ color: watchlist.includes(selected) ? T.gold : undefined }} onClick={() => toggleWatchlist(selected)} />
                {isTrader && <Button size="small" icon={<SwapOutlined />} onClick={() => setOrderSide(orderSide === 'buy' ? 'sell' : 'buy')}>{orderSide === 'buy' ? '买入' : '卖出'}</Button>}
              </Space>
            }>
              {!isTrader ? (
                /* ── 代表端：只读行情面板 ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', gap: 24, alignItems: 'baseline', padding: '8px 0' }}>
                    <div>
                      <div style={{ fontSize: 12, color: T.textMuted }}>最新价</div>
                      <div style={{ fontSize: 32, fontWeight: 700, color: trendColor(selectedStock ? quotePct(selectedStock) : 0) }}>
                        {selectedStock ? quotePrice(selectedStock).toFixed(2) : '--'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: T.textMuted }}>涨跌幅</div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: trendColor(selectedStock ? quotePct(selectedStock) : 0) }}>
                        {selectedStock ? fmtPct(quotePct(selectedStock)) : '--'}
                      </div>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: 12, color: T.textMuted }}>
                      <RiseOutlined style={{ color: '#e74c3c', marginRight: 4 }} />代表端只读行情 · 交易权限由管理端/操作端执行
                    </div>
                  </div>
                  {/* 全市场概览（只读） */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {market.map((s) => (
                      <div key={s.symbol} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid ' + T.border, minWidth: 130 }}>
                        <div style={{ fontSize: 12, color: T.textMuted }}>{s.symbol} · {s.name}</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: trendColor(quotePct(s)) }}>{quotePrice(s).toFixed(2)} <span style={{ fontSize: 11 }}>{fmtPct(quotePct(s))}</span></div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: T.textMuted, padding: '6px 0', borderTop: `1px dashed ${T.border}`, lineHeight: 1.8 }}>
                    当前可用资金 <span style={{ color: T.gold, fontWeight: 600 }}>{fmtMoney(portfolio?.user?.balance)}</span> · 持仓市值 <span style={{ fontWeight: 600 }}>{fmtMoney(portfolio?.summary?.marketValue)}</span> · 总资产 <span style={{ fontWeight: 600 }}>{fmtMoney(portfolio?.summary?.totalAssets)}</span>
                  </div>
                </div>
              ) : (
                /* ── 管理端/操作端：完整版交易面板 ── */
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <Segmented
                        value={orderSide}
                        onChange={(v) => setOrderSide(v as 'buy' | 'sell')}
                        options={[
                          { label: '买入', value: 'buy' },
                          { label: '卖出', value: 'sell' },
                        ]}
                      />
                      <Button size="small" onClick={() => setOrderShares(100)}>100</Button>
                      <Button size="small" onClick={() => setOrderShares(500)}>500</Button>
                      <Button size="small" onClick={() => setOrderShares(1000)}>1000</Button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 12, color: T.textMuted, width: 60 }}>数量(股)</span>
                      <InputNumber min={1} max={orderSide === 'sell' ? selectedPosition?.shares : 1000000} value={orderShares} onChange={(v) => setOrderShares(v ?? 0)} style={{ width: 140 }} />
                      {orderSide === 'sell' && <span style={{ fontSize: 11, color: T.textMuted }}>可卖 {selectedPosition?.shares?.toLocaleString('zh-CN') ?? 0} 股</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
                      <span style={{ fontSize: 12, color: T.textMuted, width: 60 }}>价格(元)</span>
                      <InputNumber min={0.01} step={0.01} value={orderPrice} onChange={(v) => setOrderPrice(v)} style={{ width: 140 }} />
                      <span style={{ fontSize: 11, color: T.textMuted }}>现价 {selectedStock ? quotePrice(selectedStock).toFixed(2) : '--'}</span>
                    </div>
                    <Button
                      type="primary"
                      block
                      loading={orderSubmitting}
                      onClick={submitOrder}
                      style={{
                        background: orderSide === 'buy' ? '#e74c3c' : '#2ecc71',
                        borderColor: orderSide === 'buy' ? '#e74c3c' : '#2ecc71',
                        height: 40, fontWeight: 600,
                      }}
                    >
                      {orderSide === 'buy' ? '买入' : '卖出'} {selected}
                    </Button>
                  </div>
                  <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: T.textMuted }}>持仓概览</div>
                    {(portfolio?.positions?.length ?? 0) > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {portfolio!.positions!.map((p) => (
                          <div key={p.symbol} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.03)' }}>
                            <span style={{ fontSize: 12 }}>{p.symbol} · {p.name}</span>
                            <span style={{ fontSize: 12 }}>{p.shares}股</span>
                            <span style={{ fontSize: 12, color: trendColor(p.pnl) }}>{fmtPct(p.pnlRatio)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: T.textMuted, padding: '8px 0' }}>暂无持仓</div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <Card size="small" style={{ background: T.cardBg, borderColor: T.border }} title={<span style={{ fontSize: 13, color: T.textPrimary }}>K线走势</span>} extra={<span style={{ fontSize: 11, color: T.textMuted }}>30s 刷新 · 已成交订单聚合</span>}>
            <KlinePanel candles={candles} loading={klineLoading} />
          </Card>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Card size="small" style={{ flex: 1, minWidth: 300, background: T.cardBg, borderColor: T.border }} title={<span style={{ fontSize: 13, color: T.textPrimary }}>五档成交参考</span>} extra={<span style={{ fontSize: 11, color: T.textMuted }}>已成交订单聚合</span>}>
              <div style={{ display: 'flex', gap: 20 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#e74c3c', marginBottom: 6 }}>买入成交</div>
                  {Array.from({ length: 5 }, (_, index) => orderBook?.bids[index]).map((level, index) => <div key={`bid-${index}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, lineHeight: '24px', color: T.textMuted }}><span>买{index + 1}</span><span style={{ color: level ? '#e74c3c' : T.textMuted }}>{level ? level.price.toFixed(2) : '--'}</span><span>{level ? `${Number(level.quantity).toLocaleString('zh-CN')} 股` : '--'}</span></div>)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#2ecc71', marginBottom: 6 }}>卖出成交</div>
                  {Array.from({ length: 5 }, (_, index) => orderBook?.asks[index]).map((level, index) => <div key={`ask-${index}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, lineHeight: '24px', color: T.textMuted }}><span>卖{index + 1}</span><span style={{ color: level ? '#2ecc71' : T.textMuted }}>{level ? level.price.toFixed(2) : '--'}</span><span>{level ? `${Number(level.quantity).toLocaleString('zh-CN')} 股` : '--'}</span></div>)}
                </div>
              </div>
            </Card>
            <Card size="small" style={{ flex: 1, minWidth: 300, background: T.cardBg, borderColor: T.border }} title={<span style={{ fontSize: 13, color: T.textPrimary }}>大单提示</span>} extra={<span style={{ fontSize: 11, color: T.textMuted }}>单笔 ≥ 1,000 股</span>}>
              {(orderBook?.largeTrades?.length ?? 0) > 0 ? orderBook!.largeTrades.map((trade, index) => <div key={`${trade.created_at}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, lineHeight: '25px', borderBottom: index === orderBook!.largeTrades.length - 1 ? 'none' : `1px solid ${T.border}` }}><span style={{ color: trade.side === 'buy' ? '#e74c3c' : '#2ecc71' }}>{trade.side === 'buy' ? '买入大单' : '卖出大单'}</span><span>{fmtMoney(trade.price)} · {Number(trade.quantity).toLocaleString('zh-CN')} 股</span><span style={{ color: T.textMuted }}>{String(trade.created_at).slice(5, 16)}</span></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无达到提示阈值的大单" />}
            </Card>
            <Card size="small" style={{ flex: 1, minWidth: 230, background: T.cardBg, borderColor: T.border }} title={<span style={{ fontSize: 13, color: T.textPrimary }}>涨跌榜</span>}>
              {[...market].sort((a, b) => quotePct(b) - quotePct(a)).slice(0, 3).map((stock, index) => <div key={stock.symbol} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, lineHeight: '26px' }}><span style={{ color: T.textMuted }}>{index + 1} · {stock.symbol}</span><span style={{ color: trendColor(quotePct(stock)) }}>{fmtPct(quotePct(stock))}</span></div>)}
            </Card>
          </div>

          {/* ── 下：持仓 + 成交记录（仅 admin/operator）── */}
          {isTrader && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Card size="small" style={{ flex: 1, minWidth: 480, background: T.cardBg, borderColor: T.border }} title={<span style={{ fontSize: 13, color: T.textPrimary }}>我的持仓</span>}>
                {(portfolio?.positions?.length ?? 0) > 0 ? (
                  <Table size="small" rowKey="symbol" columns={positionColumns as any} dataSource={portfolio!.positions!} pagination={false} />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无持仓，可通过左侧交易面板买入" />
                )}
              </Card>
              <Card size="small" style={{ flex: 1, minWidth: 380, background: T.cardBg, borderColor: T.border }} title={<span style={{ fontSize: 13, color: T.textPrimary }}>最近成交</span>}>
                {(portfolio?.recentTrades?.length ?? 0) > 0 ? (
                  <Table size="small" rowKey={(_, i) => String(i ?? 0)} columns={orderColumns as any} dataSource={portfolio!.recentTrades!} pagination={false} />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成交记录" />
                )}
              </Card>
            </div>
          )}
          {!isTrader && (
            <Card size="small" style={{ background: T.cardBg, borderColor: T.border }} title={<span style={{ fontSize: 13, color: T.textPrimary }}>我的持仓（只读）</span>}>
              {(portfolio?.positions?.length ?? 0) > 0 ? (
                <Table size="small" rowKey="symbol" columns={positionColumns as any} dataSource={portfolio!.positions!} pagination={false} />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无持仓" />
              )}
            </Card>
          )}
        </>
      )}

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
              options={adjustUsers.map((u) => ({ value: u.username, label: `${u.username}（${u.role === 'rep' ? '代表' : u.role === 'admin' ? '管理' : '操作'}）` }))}
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
    </div>
  )
}

export default StockMarketPage
