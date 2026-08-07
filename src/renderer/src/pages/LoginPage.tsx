import React, { useState } from 'react'
import { Form, Input, Button, Typography, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { IPC_CHANNELS } from '../../../shared/constants'
import { LOGO_B64 } from '../components/layout/logo-b64'

const invoke = (ch: string, ...args: unknown[]) => window.api.invoke(ch, ...args)

interface Props {
  onLogin: (user: { id: number; username: string; role: string }) => void
}

const LoginPage: React.FC<Props> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false)
  const [isRegister, setIsRegister] = useState(false)
  const [form] = Form.useForm()

  const handleSubmit = async (values: { username: string; password: string; confirm?: string }) => {
    setLoading(true)
    try {
      if (isRegister) {
        if (values.password !== values.confirm) {
          message.error('两次密码不一致')
          setLoading(false)
          return
        }
        const reg = await invoke(IPC_CHANNELS.AUTH_REGISTER, values.username, values.password) as any
        if (reg.success) {
          message.success('注册成功，请登录')
          setIsRegister(false)
          form.resetFields()
        } else {
          message.error(reg.message || '注册失败')
        }
      } else {
        const result = await invoke(IPC_CHANNELS.AUTH_LOGIN, values.username, values.password) as any
        if (result.success) {
          onLogin(result.user)
        } else {
          message.error(result.message || '登录失败')
        }
      }
    } catch {
      message.error(isRegister ? '注册失败' : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setIsRegister(!isRegister)
    form.resetFields()
  }

  return (
    <div
      style={{
        height: '100vh',
        background: '#0a0e17',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(245,158,11,0.06), transparent 70%)',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute', bottom: '-20%', left: '-10%',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(6,182,212,0.05), transparent 70%)',
        pointerEvents: 'none'
      }} />

      <div
        style={{
          width: 380,
          padding: '40px 32px',
          borderRadius: 16,
          background: '#111827',
          border: '1px solid rgba(45, 58, 78, 0.5)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          position: 'relative',
          zIndex: 1
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src={LOGO_B64}
            alt="logo"
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              objectFit: 'cover',
              boxShadow: '0 4px 16px rgba(245,158,11,0.2)',
              marginBottom: 12
            }}
          />
          <Typography.Title level={4} style={{ color: '#e8edf5', margin: 0, fontSize: 20 }}>
            Gipfel
          </Typography.Title>
          <Typography.Text style={{ color: '#64748b', fontSize: 12, marginTop: 4, display: 'block' }}>
            {isRegister ? '创建新账号' : '基础设施合同管理 · 区域模拟系统'}
          </Typography.Text>
        </div>

        <Form form={form} onFinish={handleSubmit} layout="vertical" size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input
              prefix={<UserOutlined style={{ color: '#64748b' }} />}
              placeholder="用户名"
              style={{ background: '#1a2332', borderColor: '#2d3a4e', color: '#e8edf5', height: 44, borderRadius: 8 }}
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password
              prefix={<LockOutlined style={{ color: '#64748b' }} />}
              placeholder="密码"
              style={{ background: '#1a2332', borderColor: '#2d3a4e', color: '#e8edf5', height: 44, borderRadius: 8 }}
            />
          </Form.Item>
          {isRegister && (
            <Form.Item name="confirm" rules={[{ required: true, message: '请确认密码' }]}>
              <Input.Password
                prefix={<LockOutlined style={{ color: '#64748b' }} />}
                placeholder="确认密码"
                style={{ background: '#1a2332', borderColor: '#2d3a4e', color: '#e8edf5', height: 44, borderRadius: 8 }}
              />
            </Form.Item>
          )}
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 44, borderRadius: 8, fontSize: 15, fontWeight: 500,
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                border: 'none',
                boxShadow: '0 4px 16px rgba(245,158,11,0.25)'
              }}
            >
              {isRegister ? '注 册' : '登 录'}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button
            type="link"
            onClick={toggleMode}
            style={{ color: '#f59e0b', fontSize: 13 }}
          >
            {isRegister ? '已有账号？去登录' : '没有账号？注册'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
