import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Tag, InputNumber, Segmented, Table, Empty, Spin, Modal, Select, Input, message } from 'antd'
import { WalletOutlined, ReloadOutlined, StarOutlined, StarFilled, SearchOutlined, LineChartOutlined, ControlOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext'
import { canTradeStocks } from '../../../shared/permissions'
import { IPC_CHANNELS } from '../../../shared/constants'
import { invoke } from '../api/cloudApi'
import { tokens as T } from '../styles/design-tokens'
import { CLOUD_API_BASE } from '../../../shared/cloud-config'
import ProfessionalKlineChart from '../components/stocks/ProfessionalKlineChart'
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

type StockQuote = { symbol: string; name: string; current_price?: number; price?: number; change_pct?: number; changePct?: number; change?: number }
type Position = { symbol: string; name: string; shares: number; avgCost: number; currentPrice: number; marketValue: number; pnl: number; pnlRatio: number }
type Candle = { round: number; time: string; open: number; high: number; low: number; close: number; volume: number }
type OrderBook = { mode?: 'trade-distribution'; bids: { price: number; quantity: number }[]; asks: { price: number; quantity: number }[]; largeTrades: { side: string; price: number; quantity: number; created_at: string }[] }
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
  const [marketQuery, setMarketQuery] = useState('')
  const [marketScope, setMarketScope] = useState<'all' | 'watch'>('all')
  const [ledgerView, setLedgerView] = useState<'positions' | 'trades'>('positions')
  const aliveRef = useRef(true)

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

  // ── 持仓拉取（/portfolio?username= 需 token）──
  const loadPortfolio = useCallback(async (tok: string, uname: string) => {
    if (!tok) return
    try {
      const res = await fetchWithStockAuth(
        `${STOCK_API}/portfolio?username=${encodeURIComponent(uname)}`,
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
      const res = await fetchWithStockAuth(`${STOCK_API}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selected, side: orderSide, quantity: orderShares, price,
          username, idempotency_key: idem,
        }),
      }, token)
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
  }, [token, username, market, selected, orderSide, orderShares, orderPrice, portfolio, loadPortfolio, loadMarket, loadKline, loadOrderBook, fetchWithStockAuth])

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
  const selectedPrice = selectedStock ? quotePrice(selectedStock) : 0
  const selectedPct = selectedStock ? quotePct(selectedStock) : 0
  const selectedChange = Number(selectedStock?.change ?? (candles.length > 1 ? selectedPrice - candles[candles.length - 2].close : 0))
  const estimatedAmount = Math.max(0, Number(orderShares || 0) * Number(orderPrice || 0))
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
        </div>
      </header>

      <section className="gipfel-trading__asset-ledger" aria-label="账户资产">
        <div className="is-primary"><span>总资产</span><strong>{fmtMoney(portfolio?.summary?.totalAssets)}</strong><small>{username || '账户尚未连接'}</small></div>
        <div><span>可用资金</span><strong>{fmtMoney(portfolio?.user?.balance)}</strong></div>
        <div><span>持仓市值</span><strong>{fmtMoney(portfolio?.summary?.marketValue)}</strong></div>
        <div><span>浮动盈亏</span><strong style={{ color: trendColor(portfolio?.summary?.totalPnl) }}>{fmtMoney(portfolio?.summary?.totalPnl)}</strong><small style={{ color: trendColor(portfolio?.summary?.pnlRatio) }}>{fmtPct(portfolio?.summary?.pnlRatio)}</small></div>
        <div><span>权限模式</span><strong>{isTrader ? role === 'admin' ? '管理端' : '操作端' : '只读行情'}</strong><small>{isTrader ? '交易与资金操作已启用' : '无买卖入口'}</small></div>
      </section>

      {loading ? (
        <div className="gipfel-trading__state"><Spin tip="正在连接交易市场" /></div>
      ) : marketFailed ? (
        <div className="gipfel-trading__state">
          <Empty description="行情连接失败，请检查网络后重试">
            <Button icon={<ReloadOutlined />} onClick={() => { setLoading(true); loadMarket().finally(() => setLoading(false)) }}>重试</Button>
          </Empty>
        </div>
      ) : (
        <>
          <section className={`gipfel-trading__workbench ${!isTrader ? 'is-readonly' : ''}`}>
            <aside className="gipfel-trading__tape" aria-label="股票行情列表">
              <div className="gipfel-trading__panel-head">
                <div><strong>市场行情</strong><span>{market.length} 只 · 15 秒同步</span></div>
                <LineChartOutlined />
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
              <div className="gipfel-trading__chart-head">
                <div><strong>价格走势</strong><span>按已成交订单聚合 · 30 秒同步</span></div>
                <div className="gipfel-trading__legend"><span className="is-up">上涨</span><span className="is-down">下跌</span><span>十字光标查看 OHLC</span></div>
              </div>
              <ProfessionalKlineChart candles={candles} loading={klineLoading} symbol={selected} />
              <div className="gipfel-trading__market-insight">
                <div><span>涨幅领先</span><strong>{rankedMarket[0]?.symbol || '--'}</strong><b className="is-up">{rankedMarket[0] ? fmtPct(quotePct(rankedMarket[0])) : '--'}</b></div>
                <div><span>跌幅领先</span><strong>{rankedMarket[rankedMarket.length - 1]?.symbol || '--'}</strong><b className="is-down">{rankedMarket.length ? fmtPct(quotePct(rankedMarket[rankedMarket.length - 1])) : '--'}</b></div>
                <div><span>大单监测</span><strong>{orderBook?.largeTrades?.length ?? 0} 笔</strong><b>阈值 1,000 股</b></div>
              </div>
            </main>

            <aside className="gipfel-trading__execution">
              {isTrader ? (
                <section className="gipfel-trading__ticket">
                  <div className="gipfel-trading__panel-head"><div><strong>委托下单</strong><span>限价撮合 · {selected}</span></div><SafetyCertificateOutlined /></div>
                  <Segmented
                    className={`gipfel-trading__side-switch is-${orderSide}`}
                    block
                    value={orderSide}
                    onChange={(value) => setOrderSide(value as 'buy' | 'sell')}
                    options={[{ label: '买入', value: 'buy' }, { label: '卖出', value: 'sell' }]}
                  />
                  <label className="gipfel-trading__field"><span>委托价格</span><InputNumber min={0.01} step={0.01} precision={2} value={orderPrice} onChange={setOrderPrice} addonBefore="¥" /></label>
                  <label className="gipfel-trading__field"><span>委托数量</span><InputNumber min={1} max={orderSide === 'sell' ? selectedPosition?.shares : 1000000} precision={0} value={orderShares} onChange={(value) => setOrderShares(value ?? 0)} addonAfter="股" /></label>
                  <div className="gipfel-trading__quick-size">
                    {[100, 500, 1000].map((size) => <button key={size} onClick={() => setOrderShares(size)}>{size.toLocaleString('zh-CN')}</button>)}
                    {orderSide === 'sell' && <button onClick={() => setOrderShares(selectedPosition?.shares ?? 0)}>全部</button>}
                  </div>
                  <dl className="gipfel-trading__order-summary">
                    <div><dt>可卖数量</dt><dd>{(selectedPosition?.shares ?? 0).toLocaleString('zh-CN')} 股</dd></div>
                    <div><dt>预计金额</dt><dd>{fmtMoney(estimatedAmount)}</dd></div>
                    <div><dt>可用资金</dt><dd>{fmtMoney(portfolio?.user?.balance)}</dd></div>
                  </dl>
                  <Button
                    className={`gipfel-trading__submit is-${orderSide}`}
                    block
                    loading={orderSubmitting}
                    disabled={marketState !== 'open' || !token}
                    onClick={submitOrder}
                  >
                    {marketState !== 'open' ? '市场已收盘' : !token ? '账户未连接' : `${orderSide === 'buy' ? '确认买入' : '确认卖出'} ${selected}`}
                  </Button>
                </section>
              ) : (
                <section className="gipfel-trading__readonly">
                  <SafetyCertificateOutlined />
                  <strong>只读行情模式</strong>
                  <p>代表端可以查看行情、K 线和个人持仓，不显示任何买卖或资金操作入口。</p>
                </section>
              )}

              <section className="gipfel-trading__book">
                <div className="gipfel-trading__panel-head"><div><strong>{orderBook?.mode === 'trade-distribution' ? '成交价位分布' : '五档盘口'}</strong><span>{orderBook?.mode === 'trade-distribution' ? '历史成交聚合，非实时挂单' : '实时委托'}</span></div><span className="gipfel-trading__spread">现价 {selectedPrice.toFixed(2)}</span></div>
                <div className="gipfel-trading__book-head"><span>档位</span><span>价格</span><span>数量</span></div>
                <div className="gipfel-trading__levels is-ask">
                  {Array.from({ length: 5 }, (_, index) => orderBook?.asks[4 - index]).map((level, index) => <div key={`ask-${index}`}><span>卖 {5 - index}</span><b>{level ? level.price.toFixed(2) : '--'}</b><span>{level ? Number(level.quantity).toLocaleString('zh-CN') : '--'}</span></div>)}
                </div>
                <div className="gipfel-trading__mid-price" style={{ color: trendColor(selectedPct) }}><strong>{selectedPrice ? selectedPrice.toFixed(2) : '--'}</strong><span>{fmtPct(selectedPct)}</span></div>
                <div className="gipfel-trading__levels is-bid">
                  {Array.from({ length: 5 }, (_, index) => orderBook?.bids[index]).map((level, index) => <div key={`bid-${index}`}><span>买 {index + 1}</span><b>{level ? level.price.toFixed(2) : '--'}</b><span>{level ? Number(level.quantity).toLocaleString('zh-CN') : '--'}</span></div>)}
                </div>
              </section>
            </aside>
          </section>

          <section className="gipfel-trading__ledger">
            <div className="gipfel-trading__ledger-tabs" role="tablist" aria-label="账户明细">
              <button id="positions-tab" role="tab" aria-controls="ledger-panel" aria-selected={ledgerView === 'positions'} className={ledgerView === 'positions' ? 'is-active' : ''} onClick={() => setLedgerView('positions')}>持仓资产 <span>{portfolio?.positions?.length ?? 0}</span></button>
              <button id="trades-tab" role="tab" aria-controls="ledger-panel" aria-selected={ledgerView === 'trades'} className={ledgerView === 'trades' ? 'is-active' : ''} onClick={() => setLedgerView('trades')}>最近成交 <span>{portfolio?.recentTrades?.length ?? 0}</span></button>
              {role === 'admin' && <button className="gipfel-trading__admin-link" onClick={openAdjust}><ControlOutlined /> 管理端资金控制</button>}
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
    </div>
  )
}

export default StockMarketPage
