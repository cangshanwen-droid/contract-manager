import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Card, Button, Tag, Space, InputNumber, Segmented, Table, Empty, Spin, Modal, Select, message } from 'antd'
import { WalletOutlined, ReloadOutlined, SwapOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext'
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
  const { user } = useAuth()
  const role = user?.role || 'admin'
  const isTrader = role !== 'rep' // 管理端/操作端可交易；代表端只读

  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [market, setMarket] = useState<StockQuote[]>([])
  const [marketState, setMarketState] = useState('open')
  const [round, setRound] = useState(1)
  const [selected, setSelected] = useState('JGONG')
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
      let uname = 'admin'
      let pwd = 'admin123'
      const r = await invoke(IPC_CHANNELS.CREDENTIAL_GET) as { success?: boolean; credentials?: { username?: string; password?: string } | null } | null
      const saved = r?.success ? r.credentials : null
      if (saved?.username && saved?.password) {
        uname = saved.username
        pwd = saved.password
      }
      const res = await fetch(`${STOCK_API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uname, password: pwd }),
      })
      if (!res.ok) throw new Error('登录失败')
      const data = await res.json()
      if (!data?.token) throw new Error('登录失败')
      return { token: data.token, username: uname }
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

  // 持仓轮询（非 rep）
  useEffect(() => {
    if (!isTrader || !token) return
    const t = setInterval(() => { loadPortfolio(token, username) }, PORTFOLIO_POLL_MS)
    return () => clearInterval(t)
  }, [isTrader, token, username, loadPortfolio])

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
    } catch (e: any) {
      message.error(e?.message || '下单失败')
    } finally {
      setOrderSubmitting(false)
    }
  }, [token, username, market, selected, orderSide, orderShares, orderPrice, loadPortfolio, loadMarket])

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
      let uname = 'admin'
      let pwd = 'admin123'
      const r = await invoke(IPC_CHANNELS.CREDENTIAL_GET) as { success?: boolean; credentials?: { username?: string; password?: string } | null } | null
      const saved = r?.success ? r.credentials : null
      if (saved?.username && saved?.password) { uname = saved.username; pwd = saved.password }
      const loginRes = await fetch(`${STOCK_API}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uname, password: pwd }),
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
                        <div style={{ fontSize: 13, fontWeight: 600, color: active ? T.gold : T.textPrimary }}>{s.symbol}</div>
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
                      <InputNumber min={1} max={1000000} value={orderShares} onChange={(v) => setOrderShares(v ?? 0)} style={{ width: 140 }} />
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
