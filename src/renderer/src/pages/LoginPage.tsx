/**
 * LoginPage - Gipfel Financial Platform
 * 清晰、低干扰的企业级入口：深海蓝底色、金融金强调、明确中文字段标签。
 */
import React, { useState, useEffect } from 'react'
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
  useEffect(() => {
    (async () => {
      try {
        const r = await invoke(IPC_CHANNELS.AUTH_LIST_USERS) as any
        const list = Array.isArray(r) ? r : (r?.users && Array.isArray(r.users) ? r.users : [])
        if (list.length === 0) setIsFirstUse(true)
      } catch {
        /* 静默 */
      }
    })()
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
      background: T.bgRoot,
      fontFamily: "'Inter','SF Pro Display','Helvetica Neue','HarmonyOS Sans','Microsoft YaHei',sans-serif",
    }} className="gipfel-login">

      {/* LEFT - Brand */}
      <div style={{ flex: '0 0 52%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        position: 'relative', zIndex: 1, padding: 48, borderRight: `1px solid ${T.border}` }}>
        <div style={{ textAlign: 'center', maxWidth: 440 }}>
          <div style={{ display: 'inline-block', marginBottom: 20 }}><LogoFull width={180} /></div>

          <div style={{ marginTop: 8, fontSize: 14, fontWeight: 400, color: T.textSecondary, letterSpacing: '.16em' }}>
            智能金融管理平台
          </div>
          <div style={{ fontSize: 11, color: 'rgba(138,155,181,0.4)', letterSpacing: '.12em', marginTop: 2 }}>
            Financial Intelligence Platform
          </div>

          <div style={{ marginTop: 44, display: 'flex', gap: 12, justifyContent: 'center' }}>
            {caps.map((t, idx) => (
              <div key={t.zh}
                style={{
                  padding: '12px 16px', borderRadius: 4, textAlign: 'center',
                  background: T.bgPanel, border: `1px solid ${T.border}`,
                  minWidth: 110,
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

          <div style={{ marginTop: 36, display: 'flex', gap: 32, justifyContent: 'center' }}>
            {['MARKET DATA', 'AI ANALYTICS', 'RISK ENGINE'].map((s) => (
              <span key={s} style={{
                fontSize: 11, letterSpacing: '.12em', color: T.textSecondary,
                opacity: 0.65,
              }}>{s}</span>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT - Login card */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1, minWidth: 370, padding: 32 }}>
        <div style={{
          width: '100%', maxWidth: 370, padding: '38px 34px 32px',
          background: T.bgPanel, borderRadius: 4, border: `1px solid ${T.border}`,
        }}>
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary, letterSpacing: '.03em' }}>欢迎回来</div>
            <div style={{ width: 28, height: 2, margin: '8px auto 0', background: T.primary }} />
            <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 8, letterSpacing: '.05em' }}>登录 Gipfel 智能金融平台</div>
            <div style={{ fontSize: 11, color: 'rgba(138,155,181,0.35)', marginTop: 4, letterSpacing: '.06em' }}>Secure access · Intelligent finance</div>
          </div>

          {isFirstUse && <div style={{ marginBottom: 18, padding: '9px 12px', borderRadius: 4, background: T.warmDim, border: `1px solid ${T.border}`, textAlign: 'center', fontSize: 11, color: T.primary }}>首次使用 · 创建管理员账号</div>}

          <Form form={form} onFinish={handleSubmit} layout="vertical" size="large">
            <Form.Item label={<span style={{ color: T.textSecondary, fontSize: 12 }}>账号名称 · 例如 admin</span>} name="username" rules={[{ required: true, message: '请输入用户名' }]} style={{ marginBottom: 16 }}>
              <Input prefix={<UserOutlined style={{ color: T.textSecondary, fontSize: 14 }} />}
                placeholder="用户名" autoFocus
                style={{ height: 44, borderRadius: 4, fontSize: 13, background: T.bgRoot, borderColor: T.border, color: T.textPrimary, caretColor: T.primary }} />
            </Form.Item>
            <Form.Item label={<span style={{ color: T.textSecondary, fontSize: 12 }}>登录密码 · 至少 6 位</span>} name="password" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6位' }]} style={{ marginBottom: isFirstUse ? 16 : 22 }}>
              <Input.Password prefix={<LockOutlined style={{ color: T.textSecondary, fontSize: 14 }} />}
                placeholder="密码"
                style={{ height: 44, borderRadius: 4, fontSize: 13, background: T.bgRoot, borderColor: T.border, color: T.textPrimary, caretColor: T.primary }} />
            </Form.Item>
            {isFirstUse && <Form.Item label={<span style={{ color: T.textSecondary, fontSize: 12 }}>确认密码 · 再次输入密码</span>} name="confirm" rules={[{ required: true, message: '请确认密码' }]} style={{ marginBottom: 22 }}>
              <Input.Password prefix={<LockOutlined style={{ color: T.textSecondary, fontSize: 14 }} />} placeholder="确认密码"
                style={{ height: 44, borderRadius: 4, fontSize: 13, background: T.bgRoot, borderColor: T.border, color: T.textPrimary, caretColor: T.primary }} />
            </Form.Item>}
            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" loading={loading} block
                style={{ height: 44, fontSize: 14, fontWeight: 700, borderRadius: 4, letterSpacing: '.05em', background: T.primary, borderColor: T.primary, color: T.bgRoot }}>
                {isFirstUse ? '创建管理员账号' : (<>登录 <span className="gipfel-login__arrow" style={{ marginLeft: 3 }}>→</span></>)}
              </Button>
            </Form.Item>
          </Form>
          <div style={{ textAlign: 'center', marginTop: 22 }}>
            <span style={{ fontSize: 11, color: 'rgba(138,155,181,.2)', letterSpacing: '.05em' }}>© 2026 Gipfel Financial Platform</span>
          </div>
        </div>
      </div>

    </div>
  )
}
export default LoginPage
