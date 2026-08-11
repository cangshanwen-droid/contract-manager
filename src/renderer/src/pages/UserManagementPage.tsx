/**
 * UserManagementPage - 用户管理（仅 admin 可访问）
 *
 * 管理员可在此页面：
 * - 查看所有用户列表
 * - 新建用户（指定用户名、密码、角色）
 * - 删除用户（不可删除自己，不可删除最后一个 admin）
 */

import React, { useEffect, useState } from 'react'
import {
  Table, Button, Modal, Form, Input, Select, Space,
  Typography, message, Tag, Popconfirm, Empty
} from 'antd'
import { PlusOutlined, UserOutlined, KeyOutlined } from '@ant-design/icons'
import { IPC_CHANNELS } from '../../../shared/constants'
import { PERMISSIONS, hasPermission } from '../../../shared/permissions'
import { invoke } from '../api/cloudApi'
import { useAuth } from '../context/AuthContext'
import dayjs from 'dayjs'
import { tokens as T } from '../styles/design-tokens'

const ROLE_LABELS: Record<string, string> = {
  rep: '代表端',
  operator: '操作端',
  admin: '管理端',
}

const ROLE_COLORS: Record<string, string> = {
  rep: T.textSecondary,
  operator: '#D4AF37',
  admin: '#D4AF37',
}

interface UserRow {
  id: number
  username: string
  role: string
  created_at?: string
  last_login?: string | null
  // v22 公司绑定
  company_id?: number | null
  company_name?: string
}

interface Props {
  currentUserId?: number
  currentUserRole?: string
}

const UserManagementPage: React.FC<Props> = ({ currentUserId }) => {
  const user = useAuth()
  // 仅 admin / 拥有 user.manage 权限者可重置密码
  const canManage = hasPermission(user, PERMISSIONS.USER_MANAGE)
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  // v22 公司绑定：所属公司下拉选项（company:list）
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm] = Form.useForm()
  const [deleteConfirming, setDeleteConfirming] = useState<number | null>(null)
  // ── 重置密码弹窗 ──
  const [resetOpen, setResetOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null)
  const [resetSubmitting, setResetSubmitting] = useState(false)
  const [resetForm] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const r = await invoke(IPC_CHANNELS.AUTH_LIST_USERS) as any
      if (r?.success && Array.isArray(r.users)) {
        setUsers(r.users)
      }
    } catch (err: any) {
      message.error('加载用户列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // v22 公司绑定：加载公司列表供「所属公司」下拉（失败不阻塞用户管理）
  useEffect(() => {
    (async () => {
      try {
        const r = await invoke(IPC_CHANNELS.COMPANY_LIST) as any
        const list = Array.isArray(r) ? r : (r?.success && Array.isArray(r.items) ? r.items : null)
        if (list) setCompanies(list.map((c: any) => ({ id: c.id, name: c.name })))
      } catch {
        /* 公司列表加载失败不阻塞用户管理 */
      }
    })()
  }, [])

  // ── 快捷键：Escape 关闭弹窗 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && createOpen) { createForm.resetFields(); setCreateOpen(false); e.preventDefault() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createOpen])

  const handleCreate = async () => {
    try {
      const vals = await createForm.validateFields()
      // v22 公司绑定：第 4 参 companyId（null = 未绑定）
      // v24 多公司绑定：operator 传 company_ids 数组（第 7 参）；rep/admin 单值 company_id
      const role = vals.role || 'rep'
      const companyIds = (role === 'operator' && Array.isArray(vals.company_ids) && vals.company_ids.length > 0)
        ? vals.company_ids.map(Number)
        : null
      // company_id 兼容字段：operator 多选取第一个；rep/admin 用单选值
      const companyId = companyIds && companyIds.length > 0
        ? companyIds[0]
        : (vals.company_id ?? null)
      const r = await invoke(IPC_CHANNELS.AUTH_CREATE_USER, vals.username, vals.password, role, companyId, undefined, undefined, companyIds) as any
      if (!r.success) {
        message.error(r.message || '创建失败')
        return
      }
      message.success('用户创建成功')
      createForm.resetFields()
      setCreateOpen(false)
      load()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || '创建失败')
    }
  }

  const handleDelete = async (userId: number) => {
    setDeleteConfirming(userId)
    try {
      // 不能删自己
      if (currentUserId && userId === currentUserId) {
        message.error('不能删除自己的账号')
        return
      }
      const r = await invoke(IPC_CHANNELS.AUTH_DELETE_USER, userId) as any
      if (!r.success) {
        message.error(r.message || '删除失败')
        return
      }
      message.success('用户已删除')
      load()
    } catch (err: any) {
      message.error(err?.message || '删除失败')
    } finally {
      setDeleteConfirming(null)
    }
  }

  // ── 重置密码：打开弹窗（仅 admin）──
  const openReset = (row: UserRow) => {
    setResetTarget(row)
    resetForm.resetFields()
    setResetOpen(true)
  }

  const handleReset = async () => {
    if (!resetTarget) return
    try {
      const vals = await resetForm.validateFields()
      setResetSubmitting(true)
      const r = await invoke(
        IPC_CHANNELS.AUTH_RESET_PASSWORD,
        resetTarget.id,
        vals.password,
        user?.username || '',
        user?.role || ''
      ) as any
      if (!r.success) {
        message.error(r.message || '重置失败')
        return
      }
      // 允许重置自己，但给出提示
      if (r.isSelf) {
        message.info(`已重置「${resetTarget.username}」的密码（当前登录账号，下次登录请使用新密码）`)
      } else {
        message.success(`已重置「${resetTarget.username}」的密码`)
      }
      setResetOpen(false)
      load()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || '重置失败')
    } finally {
      setResetSubmitting(false)
    }
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (v: number) => <span style={{ color: T.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{v}</span>,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (v: string, row: UserRow) => (
        <Space>
          <UserOutlined style={{ color: T.textSecondary }} />
          <span style={{ color: T.textPrimary, fontWeight: 500 }}>
            {v}
            {currentUserId && row.id === currentUserId && (
              <Tag color="#D4AF37" style={{ marginLeft: 8, fontSize: 11, lineHeight: '16px' }}>当前</Tag>
            )}
          </span>
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: (v: string) => (
        <Tag color={ROLE_COLORS[v] || T.textMuted} style={{ fontSize: 12 }}>
          {ROLE_LABELS[v] || v}
        </Tag>
      ),
    },
    {
      // v22 公司绑定：列表展示所属公司
      title: '所属公司',
      dataIndex: 'company_name',
      key: 'company_name',
      width: 170,
      render: (v: string | null | undefined) => (
        v ? (
          <span style={{ color: T.textSecondary, fontSize: 12 }}>{v}</span>
        ) : (
          <span style={{ color: T.textMuted, fontSize: 12 }}>未绑定</span>
        )
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v: string) => (
        <span style={{ color: T.textMuted, fontSize: 12 }}>
          {v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'}
        </span>
      ),
    },
    {
      title: '最后登录',
      dataIndex: 'last_login',
      key: 'last_login',
      width: 180,
      render: (v: string | null) => (
        v ? (
          <span style={{ color: T.textSecondary, fontSize: 12 }}>
            {dayjs(v).format('YYYY-MM-DD HH:mm')}
          </span>
        ) : (
          <span style={{ color: T.textMuted, fontSize: 12 }}>从未登录</span>
        )
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 170,
      render: (_: unknown, row: UserRow) => {
        const isSelf = currentUserId && row.id === currentUserId
        const isLastAdmin = row.role === 'admin' && users.filter(u => u.role === 'admin').length <= 1
        const disabled = isSelf || isLastAdmin
        return (
          <Space size={0} split={null}>
            {canManage && (
              <Button
                type="link"
                size="small"
                icon={<KeyOutlined />}
                style={{ padding: '0 6px', fontSize: 12, color: T.primary }}
                onClick={() => openReset(row)}
              >
                重置密码
              </Button>
            )}
            <Popconfirm
              title={isSelf ? '不能删除自己的账号' : isLastAdmin ? '不能删除最后一个管理员' : '确认删除该用户？'}
              onConfirm={() => handleDelete(row.id)}
              disabled={disabled}
              okText="删除"
              cancelText="取消"
            >
              <Button
                type="link"
                size="small"
                danger
                disabled={disabled}
                loading={deleteConfirming === row.id}
                style={{ padding: '0 6px', fontSize: 12 }}
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  return (
    <div className="page-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>用户管理</div>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建用户
        </Button>
      </div>

      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4 }}>
          <Table
            dataSource={users}
            rowKey="id"
            columns={columns}
            pagination={false}
            size="small"
            loading={loading}
            locale={{ emptyText:
              <div style={{ padding: '24px 0' }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <div>
                      <span style={{ color: T.textPrimary, fontSize: 14, fontWeight: 500 }}>
                        暂无用户
                      </span>
                      <br />
                      <span style={{ color: T.textMuted, fontSize: 12 }}>
                        创建新用户以管理系统访问权限
                      </span>
                    </div>
                  }
                >
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                    新建用户
                  </Button>
                </Empty>
              </div>
            }}
          />
        </div>

      {/* Create User Modal */}
      <Modal
        title="新建用户"
        open={createOpen}
        onCancel={() => { createForm.resetFields(); setCreateOpen(false) }}
        onOk={handleCreate}
        okText="创建"
        width={420}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" size="small">
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 2, message: '用户名至少 2 个字符' },
            ]}
          >
            <Input placeholder="输入用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少 6 个字符' },
              {
                pattern: /^(?=.*[A-Za-z])(?=.*\d)/,
                message: '密码需包含字母和数字',
              },
            ]}
          >
            <Input.Password placeholder="输入密码（至少6位，含字母和数字）" />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
            initialValue="rep"
          >
            <Select
              placeholder="选择角色"
              options={[
                { value: 'rep', label: '代表端' },
                { value: 'operator', label: '操作端' },
                { value: 'admin', label: '管理端' },
              ]}
            />
          </Form.Item>
          {/* v24 多公司绑定：operator（操作端/主席）可多选公司；rep/admin 单选 */}
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.role !== cur.role}
          >
            {({ getFieldValue }) => {
              const role = getFieldValue('role')
              const isOperator = role === 'operator'
              return (
                <Form.Item
                  name={isOperator ? 'company_ids' : 'company_id'}
                  label="所属公司"
                  extra={isOperator
                    ? '操作端可管多家公司（多选）：绑定后仅可见/操作这些公司的数据'
                    : '可选。绑定后该用户登录仅可见本公司的合同数据（代表端强制隔离）'}
                >
                  {isOperator ? (
                    <Select
                      mode="multiple"
                      placeholder="选择多家公司（可多选）"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={companies.map(c => ({ value: c.id, label: c.name }))}
                      notFoundContent={
                        companies.length === 0 ? (
                          <span style={{ fontSize: 12, color: T.textMuted }}>暂无公司，请先在「公司管理」中创建</span>
                        ) : undefined
                      }
                    />
                  ) : (
                    <Select
                      placeholder="未绑定公司"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={companies.map(c => ({ value: c.id, label: c.name }))}
                      notFoundContent={
                        companies.length === 0 ? (
                          <span style={{ fontSize: 12, color: T.textMuted }}>暂无公司，请先在「公司管理」中创建</span>
                        ) : undefined
                      }
                    />
                  )}
                </Form.Item>
              )
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        title={resetTarget ? `重置密码 - ${resetTarget.username}` : '重置密码'}
        open={resetOpen}
        onCancel={() => { resetForm.resetFields(); setResetOpen(false) }}
        onOk={handleReset}
        okText="重置"
        confirmLoading={resetSubmitting}
        width={420}
        destroyOnClose
      >
        <Form form={resetForm} layout="vertical" size="small">
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少 6 个字符' },
              {
                pattern: /^(?=.*[A-Za-z])(?=.*\d)/,
                message: '密码需包含字母和数字',
              },
            ]}
          >
            <Input.Password placeholder="输入新密码（至少6位，含字母和数字）" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认新密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            管理员重置密码无需原密码；重置后该用户需使用新密码登录。
            {currentUserId && resetTarget?.id === currentUserId && '（当前为重置自己的账号，请牢记新密码）'}
          </Typography.Text>
        </Form>
      </Modal>
    </div>
  )
}

export default UserManagementPage
