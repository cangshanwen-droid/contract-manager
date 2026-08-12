/**
 * StockMarketPage - 股票交易（三端口视图）
 *
 * 三端口对应股票系统：
 *   rep（代表端）     → iframe 内嵌云端完整交易工作台（与操作端一致，可买卖）
 *   operator（操作端） → iframe 内嵌云端完整交易工作台（可买卖）
 *   admin（管理端）   → iframe 内嵌云端完整版（含管理面板）
 *
 * 特性：
 *   - 顶部标题栏：返回导航 + 页面标题 + 角色标签
 *   - 全部角色统一 iframe 完整版（rep 与操作端看到完全一致的交易工作台）
 *   - operator/admin 视图：iframe 全屏内嵌，加载检测 + 失败重试
 *   - 统一登录：桌面端登录后自动获取云端 token，iframe 免登录
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { CLOUD_API_BASE } from '../../../shared/cloud-config'
import { Button, Spin, Result, Card, Tag, Empty, message, Table, InputNumber, Modal, Select, Input } from 'antd'
import {
  ArrowLeftOutlined, StockOutlined, ReloadOutlined,
  GlobalOutlined, LoadingOutlined, RiseOutlined, FallOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { invoke } from '../api/cloudApi'
import { IPC_CHANNELS } from '../../../shared/constants'
import { tokens as T } from '../styles/design-tokens'

/** 云端完整版地址（Gipfel Trading Arena） */
const CLOUD_ARENA_URL = `${CLOUD_API_BASE}/`

/** 加载超时阈值 */
const LOAD_TIMEOUT_MS = 20000

/** 页面可用高度 */
const PAGE_HEIGHT = 'calc(100vh - 52px - 64px)'

/** 行情刷新间隔（rep 只读视图，秒） */

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


const StockMarketPage: React.FC = () => {
  const navigate = useNavigate()
  const auth = useAuth()
  const role = auth?.role || 'rep'



  // operator/admin 视图状态
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [arenaSrc, setArenaSrc] = useState<string>(CLOUD_ARENA_URL)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // v1.3.1-2 调整可用资金（仅 operator/admin 可见入口）
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustUsers, setAdjustUsers] = useState<{ id: number; username: string; role: string }[]>([])
  const [adjustUser, setAdjustUser] = useState('')
  const [adjustAmount, setAdjustAmount] = useState(0)
  const [adjustSubmitting, setAdjustSubmitting] = useState(false)
  const [adjustReason, setAdjustReason] = useState('')

  const openAdjust = useCallback(async () => {
    setAdjustOpen(true)
    try {
      const r = await invoke(IPC_CHANNELS.AUTH_LIST_USERS) as any
      const list = (r?.users || r || []) as { id: number; username: string; role: string }[]
      setAdjustUsers(list)
      if (list.length > 0 && !list.find(u => u.username === adjustUser)) {
        setAdjustUser(list[0].username)
      }
    } catch {
      setAdjustUsers([])
    }
  }, [adjustUser])

  // v1.3.1-2 主席/管理员调整可用资金（云端 /adjust-balance，rep 403）
  const submitAdjust = useCallback(async () => {
    if (!adjustUser) { message.warning('请选择用户'); return }
    if (!adjustAmount || adjustAmount === 0) { message.warning('请输入调整金额（正数=注入，负数=扣减）'); return }
    setAdjustSubmitting(true)
    try {
      let username = 'admin'
      let password = 'admin123'
      const r = await invoke(IPC_CHANNELS.CREDENTIAL_GET) as { success?: boolean; credentials?: { username?: string; password?: string } | null } | null
      const saved = r?.success ? r.credentials : null
      if (saved?.username && saved?.password) {
        username = saved.username
        password = saved.password
      }
      const loginRes = await fetch(`${CLOUD_ARENA_URL}auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!loginRes.ok) throw new Error('登录失败，请重新登录')
      const data = await loginRes.json()
      const token = data?.token || ''
      if (!token) throw new Error('登录失败，请重新登录')
      const idem = `adj-${adjustUser}-${Date.now()}`
      const res = await fetch(`${CLOUD_ARENA_URL}adjust-balance`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: adjustUser, amount: adjustAmount,
          reason: adjustReason || '主席调整', idempotency_key: idem,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.detail || '调整失败')
      message.success(`已调整 ${adjustUser} 可用资金 ${adjustAmount > 0 ? '+' : ''}¥${adjustAmount}，当前余额 ¥${body?.balance ?? '-'}`)
      setAdjustOpen(false)
      setAdjustAmount(0)
      setAdjustReason('')
    } catch (e: any) {
      message.error(e?.message || '调整失败')
    } finally {
      setAdjustSubmitting(false)
    }
  }, [adjustUser, adjustAmount, adjustReason])




  // ── operator/admin 视图：统一登录 URL ──
  useEffect(() => {
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {role !== 'rep' && (
            <Button
              icon={<WalletOutlined />}
              onClick={() => openAdjust()}
              style={{ background: 'rgba(212,175,55,0.12)', borderColor: 'rgba(212,175,55,0.5)', color: '#D4AF37' }}
            >调整可用资金</Button>
          )}
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

      {/* v1.3.1-2 调整可用资金弹窗（主席/管理员） */}
      <Modal
        title="调整可用资金"
        open={adjustOpen}
        onCancel={() => setAdjustOpen(false)}
        onOk={submitAdjust}
        okText="确认调整"
        confirmLoading={adjustSubmitting}
        destroyOnClose
      >
        <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 12 }}>
          调整用户（代表/主席）的股票可用资金：正数=注入，负数=扣减（扣减后余额不能为负）。代表不可自行调整。
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 4 }}>选择用户</div>
            <Select
              style={{ width: '100%' }}
              value={adjustUser || undefined}
              placeholder="选择要调整的用户"
              onChange={(v) => setAdjustUser(v)}
              options={adjustUsers.map(u => ({ value: u.username, label: `${u.username}（${u.role === 'admin' ? '管理端' : u.role === 'operator' ? '操作端' : '代表端'}）` }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 4 }}>调整金额（元）</div>
            <InputNumber
              style={{ width: '100%' }}
              value={adjustAmount}
              onChange={(v) => setAdjustAmount(Number(v) || 0)}
              placeholder="正数注入 / 负数扣减"
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 4 }}>调整原因（可选）</div>
            <Input
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="如：追加投资资金"
              maxLength={100}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default StockMarketPage