/**
 * StockMarketPage - 股票交易（三端口视图）
 *
 * 三端口对应股票系统：
 *   rep（代表端）     → 只读视图：显示本公司已上市的股票行情（不可交易）
 *   operator（操作端） → iframe 内嵌云端完整交易工作台（可买卖）
 *   admin（管理端）   → iframe 内嵌云端完整版（含管理面板）
 *
 * 特性：
 *   - 顶部标题栏：返回导航 + 页面标题 + 角色标签
 *   - rep 视图：本公司上市股票卡片（代码/名称/价格/涨跌幅），实时刷新
 *   - operator/admin 视图：iframe 全屏内嵌，加载检测 + 失败重试
 *   - 统一登录：桌面端登录后自动获取云端 token，iframe 免登录
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { CLOUD_API_BASE } from '../../../shared/cloud-config'
import { Button, Spin, Result, Card, Tag, Empty, message } from 'antd'
import {
  ArrowLeftOutlined, StockOutlined, ReloadOutlined,
  GlobalOutlined, LoadingOutlined, RiseOutlined, FallOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { invoke } from '../api/cloudApi'
import { usePolling } from '../hooks/usePolling'
import { IPC_CHANNELS } from '../../../shared/constants'
import { tokens as T } from '../styles/design-tokens'

/** 云端完整版地址（Gipfel Trading Arena） */
const CLOUD_ARENA_URL = `${CLOUD_API_BASE}/`

/** 加载超时阈值 */
const LOAD_TIMEOUT_MS = 20000

/** 页面可用高度 */
const PAGE_HEIGHT = 'calc(100vh - 52px - 64px)'

/** 行情刷新间隔（rep 只读视图，秒） */
const QUOTE_REFRESH_MS = 30000

/** 格式化为 HH:MM:SS */
const fmtHHMMSS = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 统一登录：桌面端登录后自动获取云端股票 token，iframe 免登录 */
async function fetchArenaUrl(): Promise<{ url: string; usingDefault: boolean }> {
  try {
    // 凭据由主进程 safeStorage 加密存储（credential:get），不再读 localStorage 明文
    let username = 'admin'
    let password = 'admin123'
    let usingDefault = true
    const r = await invoke(IPC_CHANNELS.CREDENTIAL_GET) as { success?: boolean; credentials?: { username?: string; password?: string } | null } | null
    const saved = r?.success ? r.credentials : null
    if (saved?.username && saved?.password) {
      username = saved.username
      password = saved.password
      usingDefault = false
    }
    const res = await fetch(`${CLOUD_ARENA_URL}auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) return { url: CLOUD_ARENA_URL, usingDefault }
    const data = await res.json()
    const token = data?.token || ''
    const role = data?.user?.role || ''
    if (!token) return { url: CLOUD_ARENA_URL, usingDefault }
    const qs = new URLSearchParams({ token, username, role })
    return { url: `${CLOUD_ARENA_URL}?${qs.toString()}`, usingDefault }
  } catch {
    return { url: CLOUD_ARENA_URL, usingDefault: true }
  }
}

/** 云端行情数据 */
interface CloudStock {
  symbol: string
  name: string
  current_price: number
  prev_price: number
  change_pct: number
  sector: string
}

/** 行情请求超时（P0-2 修复）：断网时 10s 内中止，避免轮询悬挂 */
const MARKET_TIMEOUT_MS = 10000

/** 获取云端全部股票行情 */
async function fetchMarket(): Promise<CloudStock[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), MARKET_TIMEOUT_MS)
  try {
    const res = await fetch(`${CLOUD_ARENA_URL}market`, { cache: 'no-store', signal: controller.signal })
    if (!res.ok) throw new Error('行情获取失败')
    return res.json()
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('行情请求超时，请检查网络连接')
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

const StockMarketPage: React.FC = () => {
  const navigate = useNavigate()
  const auth = useAuth()
  const role = auth?.role || 'rep'

  // rep 视图状态
  const [myStocks, setMyStocks] = useState<CloudStock[]>([])
  const [repLoading, setRepLoading] = useState(true)
  const [repError, setRepError] = useState('')
  // 最近一次行情刷新成功的时间（30s 轮询时更新）
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  // 本公司已上市股票代码集合（companies.is_listed=1 且有 stock_symbol）
  const [mySymbols, setMySymbols] = useState<Set<string>>(new Set())

  // operator/admin 视图状态
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [arenaSrc, setArenaSrc] = useState<string>(CLOUD_ARENA_URL)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── rep 只读视图：整个市场行情（只读，不可交易）──
  const loadRepStocks = useCallback(async (): Promise<boolean> => {
    setRepLoading(true)
    setRepError('')
    try {
      // 云端全部行情
      const market = await fetchMarket()
      setMyStocks(market)
      setLastUpdated(new Date())
      return true
    } catch (e: any) {
      setRepError(e?.message || '加载失败')
      return false
    } finally {
      setRepLoading(false)
    }
  }, [])

  // P0-2 修复：30s 轮询行情 — in-flight 守卫 + 失败指数退避（30s→60s→5m，恢复后重置）
  usePolling(loadRepStocks, QUOTE_REFRESH_MS, { enabled: role === 'rep' })

  // 本公司已上市股票：本地 companies 表按登录用户所属公司过滤（is_listed=1 且有 stock_symbol）
  useEffect(() => {
    if (role !== 'rep') return
    let alive = true
    const loadMySymbols = async () => {
      try {
        const res = await invoke(IPC_CHANNELS.COMPANY_LIST) as any
        const list = Array.isArray(res) ? res : (res?.data || [])
        const syms = new Set<string>()
        for (const c of list) {
          // 用户绑定公司后仅高亮本公司股票；未绑定（如历史账号）退化为全部已上市
          const isMyCompany = auth?.company_id == null || Number(c.id) === Number(auth.company_id)
          if (isMyCompany && c.is_listed && c.stock_symbol) syms.add(String(c.stock_symbol).toUpperCase())
        }
        if (alive) setMySymbols(syms)
      } catch { /* 本地公司数据不可用时不高亮 */ }
    }
    loadMySymbols()
    return () => { alive = false }
  }, [role, auth?.company_id])

  // ── operator/admin 视图：统一登录 URL ──
  useEffect(() => {
    if (role === 'rep') return
    let alive = true
    fetchArenaUrl().then(({ url, usingDefault }) => {
      if (!alive) return
      setArenaSrc(url)
      if (usingDefault) {
        // 无已保存凭据时回退默认账号并提示用户（安全审计 P1-7）
        message.warning('未找到已保存的登录凭据，正在使用默认账号（admin/admin123），如需自定义请先在登录页重新登录')
      }
    })
    return () => { alive = false }
  }, [role])

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    timerRef.current = setTimeout(() => {
      setLoadState(prev => (prev === 'ready' ? 'ready' : 'error'))
    }, LOAD_TIMEOUT_MS)
  }, [clearTimer])

  useEffect(() => {
    if (role === 'rep') return
    startTimer()
    return clearTimer
  }, [attempt, startTimer, clearTimer, role])

  const handleLoad = useCallback(() => {
    clearTimer()
    setLoadState('ready')
  }, [clearTimer])

  const handleRetry = useCallback(() => {
    setLoadState('loading')
    setAttempt(n => n + 1)
  }, [])

  const roleLabel = role === 'admin' ? '管理端' : role === 'operator' ? '操作端' : '代表端'
  const roleColor = role === 'admin' ? 'gold' : role === 'operator' ? 'blue' : 'green'

  // ── rep 只读视图渲染 ──
  if (role === 'rep') {
    return (
      <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', height: PAGE_HEIGHT }}>
        {/* 顶部标题栏 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexShrink: 0 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/dashboard')}
            style={{ background: T.panel, borderColor: T.border, color: T.textPrimary }}
          >返回</Button>
          <StockOutlined style={{ color: '#D4AF37', fontSize: 18 }} />
          <span style={{ fontSize: 18, fontWeight: 600, color: T.textPrimary, letterSpacing: '-0.01em' }}>
            股票市场
          </span>
          <Tag color={roleColor} style={{ marginLeft: 4 }}>{roleLabel} · 只读行情</Tag>
          <div style={{ marginLeft: 'auto' }}>
            <Button
              icon={<GlobalOutlined />}
              onClick={() => window.open(`${CLOUD_ARENA_URL}market`, '_blank')}
              style={{ background: T.panel, borderColor: T.border, color: T.textSecondary }}
            >查看行情</Button>
          </div>
        </div>

        {/* 说明条 */}
        <div style={{
          padding: '8px 14px', borderRadius: 4, marginBottom: 16,
          background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.12)',
          color: T.textSecondary, fontSize: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <span>代表端视图 - 查看全部股票市场行情（只读），如需买卖交易请联系操作端。</span>
          {mySymbols.size > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{
                width: 8, height: 8, borderRadius: 2, display: 'inline-block',
                background: 'rgba(212,175,55,0.25)', border: '1px solid #D4AF37',
              }} />
              <span style={{ color: '#D4AF37' }}>金色边框为本公司股票（{mySymbols.size} 只）</span>
            </span>
          )}
          {lastUpdated && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: T.textMuted, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              更新于 {fmtHHMMSS(lastUpdated)} · 每 30 秒自动刷新
            </span>
          )}
        </div>

        {/* 股票卡片 */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {repLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <Spin indicator={<LoadingOutlined spin style={{ fontSize: 28, color: '#D4AF37' }} />} />
            </div>
          ) : repError ? (
            <Result
              status="warning"
              title={<span style={{ color: T.textPrimary }}>行情加载失败</span>}
              subTitle={<span style={{ color: T.textMuted, fontSize: 12 }}>{repError}</span>}
              extra={<Button type="primary" icon={<ReloadOutlined />} onClick={() => setAttempt(n => n + 1)}>重试</Button>}
            />
          ) : myStocks.length === 0 ? (
            <Card style={{ background: T.panel, borderColor: T.border, borderRadius: 4 }}>
              <Empty
                description={
                  <div>
                    <div style={{ color: T.textPrimary, fontSize: 14, fontWeight: 500 }}>暂无市场行情</div>
                    <div style={{ color: T.textMuted, fontSize: 12, marginTop: 4 }}>
                      云端股票市场暂无可展示的股票
                    </div>
                  </div>
                }
              />
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {myStocks.map(s => {
                const up = s.change_pct >= 0
                const isMine = mySymbols.has(s.symbol.toUpperCase())
                return (
                  <Card
                    key={s.symbol}
                    style={{
                      background: T.panel,
                      borderColor: isMine ? 'rgba(212,175,55,0.55)' : T.border,
                      border: isMine ? '1px solid rgba(212,175,55,0.55)' : undefined,
                      borderRadius: 4,
                      boxShadow: isMine ? '0 0 0 1px rgba(212,175,55,0.18), 0 2px 10px rgba(212,175,55,0.06)' : undefined,
                    }}
                    styles={{ body: { padding: '16px 18px' } }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary, display: 'flex', alignItems: 'center', gap: 8 }}>
                          {s.name}
                          {isMine && (
                            <Tag color="gold" style={{ margin: 0, fontSize: 11, lineHeight: '16px', flexShrink: 0 }}>
                              本公司
                            </Tag>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, letterSpacing: '0.04em' }}>{s.symbol}</div>
                      </div>
                      <Tag color="gold" style={{ fontSize: 11 }}>{s.sector}</Tag>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14 }}>
                      <span style={{ fontSize: 24, fontWeight: 700, color: '#F5F7FA', fontVariantNumeric: 'tabular-nums' }}>
                        {s.current_price.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 11, color: T.textMuted }}>元</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      {up
                        ? <RiseOutlined style={{ color: '#22C55E', fontSize: 13 }} />
                        : <FallOutlined style={{ color: '#EF4444', fontSize: 13 }} />}
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: up ? '#22C55E' : '#EF4444',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {up ? '+' : ''}{s.change_pct.toFixed(2)}%
                      </span>
                      <span style={{ fontSize: 11, color: T.textMuted }}>
                        昨收 {s.prev_price.toFixed(2)}
                      </span>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── operator / admin 视图：iframe 完整版 ──
  return (
    <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', height: PAGE_HEIGHT }}>
      {/* 顶部标题栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexShrink: 0 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/dashboard')}
          style={{ background: T.panel, borderColor: T.border, color: T.textPrimary }}
        >返回</Button>
        <StockOutlined style={{ color: '#D4AF37', fontSize: 18 }} />
        <span style={{ fontSize: 18, fontWeight: 600, color: T.textPrimary, letterSpacing: '-0.01em' }}>
          股票交易
        </span>
        <Tag color={roleColor} style={{ marginLeft: 4 }}>{roleLabel}</Tag>
        <span style={{ fontSize: 12, color: T.textMuted }}>
          {role === 'admin' ? '完整版 · 含管理面板' : '完整交易工作台 · Gipfel Trading Arena'}
        </span>

        <div style={{ marginLeft: 'auto' }}>
          <Button
            icon={<GlobalOutlined />}
            onClick={() => window.open(CLOUD_ARENA_URL, '_blank')}
            style={{ background: T.panel, borderColor: T.border, color: T.textSecondary }}
          >在浏览器中打开</Button>
        </div>
      </div>

      {/* iframe 容器 */}
      <div style={{
        flex: 1, minHeight: 0, position: 'relative', borderRadius: 8,
        overflow: 'hidden', border: `1px solid ${T.border}`, background: T.bgRoot,
      }}>
        {loadState !== 'error' && (
          <iframe
            key={attempt}
            src={arenaSrc}
            title="Gipfel Trading Arena 云端完整版"
            onLoad={handleLoad}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        )}

        {loadState === 'loading' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: T.bgRoot }}>
            <Spin indicator={<LoadingOutlined spin style={{ fontSize: 30, color: '#D4AF37' }} />} />
            <div style={{ color: T.textSecondary, fontSize: 13 }}>正在加载云端交易工作台…</div>
          </div>
        )}

        {loadState === 'error' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bgRoot }}>
            <Result
              status="warning"
              title={<span style={{ color: T.textPrimary }}>无法连接云端交易工作台</span>}
              subTitle={<span style={{ color: T.textMuted, fontSize: 12 }}>请检查网络连接后重试（{CLOUD_ARENA_URL}）</span>}
              extra={[
                <Button key="retry" type="primary" icon={<ReloadOutlined />} onClick={handleRetry}>重试</Button>,
                <Button key="open" icon={<GlobalOutlined />} onClick={() => window.open(CLOUD_ARENA_URL, '_blank')}>在浏览器中打开</Button>,
              ]}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default StockMarketPage
