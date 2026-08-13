/**
 * LoginPage - Gipfel Financial Platform
 * 清晰、低干扰的企业级入口：深海蓝底色、金融金强调、明确中文字段标签。
 */
import React, { useState, useEffect } from 'react'
import { Form, Input, Button, message } from 'antd'
import { UserOutlined, LockOutlined, ArrowRightOutlined } from '@ant-design/icons'
import { LogoFull } from '../components/LogoSystem'
import { IPC_CHANNELS } from '../../../shared/constants'
import { setAuthToken, cloudLogin } from '../api/cloudApi'

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

  return (
    <main className="gipfel-login-v2">
      <section className="gipfel-login-v2__brief" aria-label="Gipfel 品牌视觉">
        <div className="gipfel-login-art" aria-hidden="true">
          <span className="gipfel-login-art__corner is-nw" />
          <span className="gipfel-login-art__corner is-ne" />
          <span className="gipfel-login-art__corner is-sw" />
          <span className="gipfel-login-art__corner is-se" />

          <div className="gipfel-login-art__orbit is-outer">
            <span className="gipfel-login-art__node is-a" />
            <span className="gipfel-login-art__node is-b" />
          </div>
          <div className="gipfel-login-art__orbit is-middle">
            <span className="gipfel-login-art__node is-a" />
            <span className="gipfel-login-art__node is-b" />
          </div>
          <div className="gipfel-login-art__orbit is-inner" />

          <span className="gipfel-login-art__axis is-horizontal" />
          <span className="gipfel-login-art__axis is-vertical" />
          <span className="gipfel-login-art__tick is-north" />
          <span className="gipfel-login-art__tick is-east" />
          <span className="gipfel-login-art__tick is-south" />
          <span className="gipfel-login-art__tick is-west" />

          <div className="gipfel-login-art__core">
            <span className="gipfel-login-art__core-frame" />
            <LogoFull width={220} />
          </div>
        </div>
      </section>

      <section className="gipfel-login-v2__access" aria-label="账号登录">
        <div className="gipfel-login-v2__form-wrap">
          <div className="gipfel-login-v2__form-head">
            <span className="gipfel-login-v2__session">安全会话</span>
            <h2>{isFirstUse ? '创建管理账户' : '进入工作台'}</h2>
            <p>{isFirstUse ? '完成初始设置后将自动进入管理端' : '使用已分配的机构账号继续'}</p>
          </div>

          {isFirstUse && <div className="gipfel-login-v2__notice">当前设备尚未配置账户，请创建首位管理员。</div>}

          <Form form={form} onFinish={handleSubmit} layout="vertical" size="large" className="gipfel-login-v2__form">
            <Form.Item label="账号名称" name="username" extra="例如 admin" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined aria-hidden="true" />} placeholder="请输入账号" autoFocus autoComplete="username" />
            </Form.Item>
            <Form.Item label="登录密码" name="password" extra="至少 6 位" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6位' }]}>
              <Input.Password prefix={<LockOutlined aria-hidden="true" />} placeholder="请输入密码" autoComplete={isFirstUse ? 'new-password' : 'current-password'} />
            </Form.Item>
            {isFirstUse && <Form.Item label="确认密码" name="confirm" rules={[{ required: true, message: '请确认密码' }]}>
              <Input.Password prefix={<LockOutlined aria-hidden="true" />} placeholder="请再次输入密码" autoComplete="new-password" />
            </Form.Item>}
            <Form.Item className="gipfel-login-v2__submit">
              <Button type="primary" htmlType="submit" loading={loading} block>
                {isFirstUse ? '创建并进入' : '进入系统'} <ArrowRightOutlined aria-hidden="true" />
              </Button>
            </Form.Item>
          </Form>

          <div className="gipfel-login-v2__security">
            <span aria-hidden="true" />
            账号凭据由系统安全存储，登录行为将被记录
          </div>
        </div>
      </section>
    </main>
  )
}
export default LoginPage
