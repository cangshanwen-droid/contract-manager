/**
 * LoginPage - Gipfel Financial Platform
 * Bloomberg Terminal / BlackRock Aladdin / Enterprise Finance SaaS
 * 氛围增强：卡片金色环境光 + Logo呼吸 + 粒子拖尾 + 能力卡片hover + 标签闪动
 */
import React, { useState, useEffect, useRef } from 'react'
import { Form, Input, Button, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { LogoFull } from '../components/LogoSystem'
import { IPC_CHANNELS } from '../../../shared/constants'
import { setAuthToken, cloudLogin } from '../api/cloudApi'
import { tokens as T } from '../styles/design-tokens'

const invoke = (ch: string, ...args: unknown[]) => window.api.invoke(ch, ...args)

interface Props { onLogin: (user: { id: number; username: string; role: string; permissions?: string[] }) => void }

const LoginPage: React.FC<Props> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false)
  const [isFirstUse, setIsFirstUse] = useState(false)
  const [form] = Form.useForm()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const reducedMotionRef = useRef(false)

  // --- capability card hover state ---
  const [hoveredCap, setHoveredCap] = useState<number | null>(null)

  useEffect(() => {
    (async () => { try { const r = await invoke(IPC_CHANNELS.AUTH_LIST_USERS) as any; if (r?.success && Array.isArray(r.users) && r.users.length === 0) setIsFirstUse(true) } catch {/* */} })()
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    let W = c.width = window.innerWidth, H = c.height = window.innerHeight

    // --- prefers-reduced-motion detection ---
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = mq.matches
    const onMotionChange = (e: MediaQueryListEvent) => { reducedMotionRef.current = e.matches }
    mq.addEventListener('change', onMotionChange)

    const handleResize = () => { W = c.width = window.innerWidth; H = c.height = window.innerHeight }
    window.addEventListener('resize', handleResize)

    // 克制版动画：静态金融纹理 + 极缓粒子 + Logo 光波（5s 横扫）
    // 6 个粒子，低速游走，每次全清（无拖尾）
    const pts = Array.from({ length: 6 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.05, vy: (Math.random() - 0.5) * 0.05,
      r: Math.random() * 1 + 0.4,
    }))

    // Logo 光波位置：左 52% 面板 Logo 中心偏下
    const logoCx = () => W * 0.26
    const logoBottom = () => H * 0.53

    const run = (t: number) => {
      // 全清 - 不留残影
      ctx.clearRect(0, 0, W, H)

      // 1. K线柱（右侧，静态极淡，仅微弱的透明度呼吸）
      const bars = [{ x: W * 0.78, h: 52 }, { x: W * 0.82, h: 70 }, { x: W * 0.86, h: 35 }, { x: W * 0.90, h: 48 }]
      const breathe = 0.035 + Math.sin(t / 6000) * 0.012
      for (const b of bars) {
        ctx.fillStyle = `rgba(212,175,55,${breathe})`
        ctx.fillRect(b.x, H * 0.25 + b.h, 10, b.h)
        ctx.fillStyle = `rgba(212,175,55,${breathe + 0.04})`
        ctx.fillRect(b.x + 1, H * 0.25 + b.h - 5, 8, 1.5)
      }

      // 2. 粒子 - 无 glow、无 trail，细点慢移
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > W) p.vx *= -1
        if (p.y < 0 || p.y > H) p.vy *= -1
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(212,175,55,0.045)'
        ctx.fill()
      }

      // 3. Logo 金色光波 - 5s 周期横扫，克制辉光（细线 + 弱光晕）
      const lx = logoCx(), ly = logoBottom()
      const waveProgress = (t % 5000) / 5000 // 0..1 over 5s
      const waveAlpha = Math.sin(waveProgress * Math.PI) * 0.16
      const waveWidth = 140
      const grad = ctx.createLinearGradient(lx - waveWidth, 0, lx + waveWidth, 0)
      grad.addColorStop(0, 'rgba(212,175,55,0)')
      grad.addColorStop(0.3, `rgba(212,175,55,${waveAlpha * 0.5})`)
      grad.addColorStop(0.5, `rgba(212,175,55,${waveAlpha})`)
      grad.addColorStop(0.7, `rgba(212,175,55,${waveAlpha * 0.5})`)
      grad.addColorStop(1, 'rgba(212,175,55,0)')
      // 细线核心
      ctx.strokeStyle = grad; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(lx - waveWidth, ly); ctx.lineTo(lx + waveWidth, ly); ctx.stroke()
      // 柔和光晕（半透明单层，不叠加高亮）
      ctx.globalAlpha = 0.35
      ctx.strokeStyle = grad; ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(lx - waveWidth, ly); ctx.lineTo(lx + waveWidth, ly); ctx.stroke()
      ctx.globalAlpha = 1

      if (!reducedMotionRef.current) {
        rafRef.current = requestAnimationFrame(run)
      } else {
        rafRef.current = null
      }
    }
    if (!reducedMotionRef.current) rafRef.current = requestAnimationFrame(run)
    else run(0)

    return () => {
      // P0-1 修复：取消未完成的 rAF，防止登录后 Canvas 循环永久空转
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      window.removeEventListener('resize', handleResize)
      mq.removeEventListener('change', onMotionChange)
    }
  }, [])

  const handleSubmit = async (v: { username: string; password: string; confirm?: string }) => {
    setLoading(true)
    try {
      if (isFirstUse) {
        if (v.password !== v.confirm) { message.error('两次密码不一致'); setLoading(false); return }
        const reg = await invoke(IPC_CHANNELS.AUTH_CREATE_USER, v.username, v.password, 'admin') as any
        if (!reg.success) { message.error(reg.message || '创建失败'); setLoading(false); return }
        message.success('管理员账号创建成功')
        const result = await invoke(IPC_CHANNELS.AUTH_LOGIN, v.username, v.password) as any
        if (result.success) {
          // 本地 token 兜底 + 联机同步
          setAuthToken(JSON.stringify({ u: result.user.username, t: Date.now() }))
          // 统一登录：凭据经主进程 safeStorage 加密保存（供股票系统免登录），不再写 localStorage 明文
          try { await invoke(IPC_CHANNELS.CREDENTIAL_SET, { username: v.username, password: v.password }) } catch { /* 保存失败不影响登录 */ }
          // 云端连通性探测（限时 3s，不阻塞登录体验；失败时提示云端不可达）
          const cloudOk = await Promise.race([
            cloudLogin(v.username, v.password),
            new Promise<''>((resolve) => setTimeout(() => resolve(''), 3000)),
          ])
          if (!cloudOk) {
            message.warning('登录成功，但网络连接异常：暂时无法加载数据。请检查网络后重试', 5)
          }
          onLogin(result.user)
        } else message.error('自动登录失败')
      } else {
        const result = await invoke(IPC_CHANNELS.AUTH_LOGIN, v.username, v.password) as any
        if (result.success) {
          // 本地 token 兜底 + 联机同步
          setAuthToken(JSON.stringify({ u: result.user.username, t: Date.now() }))
          // 统一登录：凭据经主进程 safeStorage 加密保存（供股票系统免登录），不再写 localStorage 明文
          try { await invoke(IPC_CHANNELS.CREDENTIAL_SET, { username: v.username, password: v.password }) } catch { /* 保存失败不影响登录 */ }
          // 云端连通性探测（限时 3s，不阻塞登录体验；失败时提示云端不可达）
          const cloudOk = await Promise.race([
            cloudLogin(v.username, v.password),
            new Promise<''>((resolve) => setTimeout(() => resolve(''), 3000)),
          ])
          if (!cloudOk) {
            message.warning('登录成功，但网络连接异常：暂时无法加载数据。请检查网络后重试', 5)
          }
          onLogin(result.user)
        } else message.error(result.message || '用户名或密码错误')
      }
    } catch { message.error('操作失败') } finally { setLoading(false) }
  }

  const caps = [
    { zh: '实时分析', en: 'Real-time Analytics' },
    { zh: '风险预测', en: 'Risk Intelligence' },
    { zh: '资产管理', en: 'Asset Management' },
  ]

  return (
    <div style={{ minHeight: '100vh', display: 'flex', position: 'relative', overflow: 'hidden',
      background: 'radial-gradient(ellipse at 62% 22%, #0B1E3A 0%, #050E1F 45%, #020810 100%)',
      fontFamily: "'Inter','SF Pro Display','Helvetica Neue','HarmonyOS Sans','Microsoft YaHei',sans-serif",
    }} className="gipfel-login">
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, opacity: .01,
        backgroundImage: 'linear-gradient(rgba(212,175,55,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.4) 1px, transparent 1px)',
        backgroundSize: '100px 100px' }} />

      {/* LEFT - Brand 45% */}
      <div style={{ flex: '0 0 52%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        position: 'relative', zIndex: 2, paddingTop: 60 }}>
        <div style={{ textAlign: 'center', maxWidth: 440 }}>
          {/* Logo graphic only - no text - with breathe animation */}
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: 24 }}>
            {/* Halo ring - behind logo */}
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              width: 260, height: 260, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(212,175,55,0.05) 0%, transparent 65%)',
              animation: reducedMotionRef.current ? 'none' : 'halo 5s ease-in-out infinite' }} />
            {/* Logo with stronger drop-shadow + breathe */}
            <div id="gipfel-logo-anim" style={{
              filter: 'drop-shadow(0 0 48px rgba(212,175,55,0.25))',
              position: 'relative', zIndex: 1,
              animation: reducedMotionRef.current ? 'none' : 'logoBreathe 6s ease-in-out infinite',
            }}>
              <LogoFull width={240} />
            </div>
          </div>

          <div style={{ marginTop: 8, fontSize: 14, fontWeight: 400, color: T.textSecondary, letterSpacing: '.16em' }}>
            智能金融管理平台
          </div>
          <div style={{ fontSize: 11, color: 'rgba(138,155,181,0.4)', letterSpacing: '.12em', marginTop: 2 }}>
            Financial Intelligence Platform
          </div>

          {/* Capability cards - hover gold border glow */}
          <div style={{ marginTop: 56, display: 'flex', gap: 12, justifyContent: 'center' }}>
            {caps.map((t, idx) => (
              <div key={t.zh}
                onMouseEnter={() => setHoveredCap(idx)}
                onMouseLeave={() => setHoveredCap(null)}
                style={{
                  padding: '14px 18px', borderRadius: 8, textAlign: 'center',
                  background: 'rgba(212,175,55,0.03)',
                  border: hoveredCap === idx
                    ? '1px solid rgba(212,175,55,0.35)'
                    : '1px solid rgba(212,175,55,0.08)',
                  boxShadow: hoveredCap === idx
                    ? '0 0 20px rgba(212,175,55,0.12)'
                    : 'none',
                  minWidth: 110,
                  cursor: 'default',
                  transition: 'border-color 300ms ease, box-shadow 300ms ease',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#D4AF37', letterSpacing: '.04em', marginBottom: 4 }}>{t.zh}</div>
                <div style={{ fontSize: 11, color: 'rgba(138,155,181,0.5)', letterSpacing: '.05em', position: 'relative' }}>
                  {t.en}
                  <div style={{ width: 14, height: 1, margin: '3px auto 0', background: 'rgba(212,175,55,0.15)', borderRadius: .5 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Bottom data label - shimmer */}
          <div style={{ marginTop: 40, display: 'flex', gap: 32, justifyContent: 'center' }}>
            {['MARKET DATA', 'AI ANALYTICS', 'RISK ENGINE'].map((s, idx) => (
              <span key={s} style={{
                fontSize: 11, letterSpacing: '.12em', color: T.textSecondary,
                opacity: 0.2,
                animation: reducedMotionRef.current ? 'none' : `labelShimmer 3s ease-in-out ${idx * 0.6}s infinite`,
              }}>{s}</span>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT - Login Card 48% - with golden ambient glow behind */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2, minWidth: 370 }}>
        {/* Golden ambient glow - 200px radial gradient behind card */}
        <div style={{
          position: 'absolute',
          width: 570, height: 570,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,175,55,0.07) 0%, rgba(212,175,55,0.03) 40%, transparent 70%)',
          pointerEvents: 'none',
          animation: reducedMotionRef.current ? 'none' : 'ambientGlow 4s ease-in-out infinite',
        }} />

        <div style={{
          width: '100%', maxWidth: 370, padding: '38px 34px 32px',
          background: '#0A1C37',
          borderRadius: 12, border: '1px solid rgba(212,175,55,0.22)',
          boxShadow: '0 12px 56px rgba(0,0,0,0.5), 0 0 30px rgba(212,175,55,0.025)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: '15%', width: '70%', height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.25), transparent)' }} />

          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#F5F7FA', letterSpacing: '.03em' }}>欢迎回来</div>
            <div style={{ width: 28, height: 2, margin: '8px auto 0', background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)', borderRadius: 1 }} />
            <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 8, letterSpacing: '.05em' }}>登录 Gipfel 智能金融平台</div>
            <div style={{ fontSize: 11, color: 'rgba(138,155,181,0.35)', marginTop: 4, letterSpacing: '.06em' }}>Secure access · Intelligent finance</div>
          </div>

          {isFirstUse && <div style={{ marginBottom: 18, padding: '9px 12px', borderRadius: 6, background: 'rgba(212,175,55,.04)', border: '1px solid rgba(212,175,55,.1)', textAlign: 'center', fontSize: 11, color: 'rgba(212,175,55,.65)' }}>首次使用 · 创建管理员账号</div>}

          <Form form={form} onFinish={handleSubmit} layout="vertical" size="large">
            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]} style={{ marginBottom: 16 }}>
              <Input prefix={<UserOutlined style={{ color: T.textSecondary, fontSize: 14 }} />}
                placeholder="用户名" autoFocus
                style={{ height: 44, borderRadius: 8, fontSize: 13, background: 'rgba(5,18,38,.6)', borderColor: 'rgba(255,255,255,.05)', color: '#F5F7FA', transition: 'all 250ms ease', caretColor: '#D4AF37' }}
                onFocus={e => { e.target.style.borderColor = 'rgba(212,175,55,.3)'; e.target.style.boxShadow = '0 0 0 3px rgba(212,175,55,.03)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,.05)'; e.target.style.boxShadow = 'none' }} />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6位' }]} style={{ marginBottom: isFirstUse ? 16 : 22 }}>
              <Input.Password prefix={<LockOutlined style={{ color: T.textSecondary, fontSize: 14 }} />}
                placeholder="密码"
                style={{ height: 44, borderRadius: 8, fontSize: 13, background: 'rgba(5,18,38,.6)', borderColor: 'rgba(255,255,255,.05)', color: '#F5F7FA', caretColor: '#D4AF37' }}
                onFocus={(e: any) => { e.target.style.borderColor = 'rgba(212,175,55,.3)'; e.target.style.boxShadow = '0 0 0 3px rgba(212,175,55,.03)' }}
                onBlur={(e: any) => { e.target.style.borderColor = 'rgba(255,255,255,.05)'; e.target.style.boxShadow = 'none' }} />
            </Form.Item>
            {isFirstUse && <Form.Item name="confirm" rules={[{ required: true, message: '请确认密码' }]} style={{ marginBottom: 22 }}>
              <Input.Password prefix={<LockOutlined style={{ color: T.textSecondary, fontSize: 14 }} />} placeholder="确认密码"
                style={{ height: 44, borderRadius: 8, fontSize: 13, background: 'rgba(5,18,38,.6)', borderColor: 'rgba(255,255,255,.05)', color: '#F5F7FA', caretColor: '#D4AF37' }} />
            </Form.Item>}
            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" loading={loading} block
                style={{ height: 44, fontSize: 14, fontWeight: 700, borderRadius: 8, letterSpacing: '.05em',
                  position: 'relative', overflow: 'hidden' }}>
                {isFirstUse ? '创建管理员账号' : (<>登录 <span className="gipfel-login__arrow" style={{ marginLeft: 3 }}>→</span></>)}
              </Button>
            </Form.Item>
          </Form>
          <div style={{ textAlign: 'center', marginTop: 22 }}>
            <span style={{ fontSize: 11, color: 'rgba(138,155,181,.2)', letterSpacing: '.05em' }}>© 2026 Gipfel Financial Platform</span>
          </div>
        </div>
      </div>

      <style>{`
/* 克制版：仅保留 Logo 极缓呼吸（6s），其余全部静态 */
@keyframes logoBreathe {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.015); }
}

/* Halo 静态（无脉动） */
@keyframes halo {
  0%, 100% { opacity: 0.6; transform: translate(-50%,-50%) scale(1); }
}

/* 底部 label 静态（无闪动） */
@keyframes labelShimmer {
  0%, 100% { opacity: 0.2; }
}

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  #gipfel-logo-anim { animation: none !important; }
  .ambient-glow { animation: none !important; }
  .label-shimmer { animation: none !important; opacity: 0.2 !important; }
}
`}</style>
    </div>
  )
}
export default LoginPage
