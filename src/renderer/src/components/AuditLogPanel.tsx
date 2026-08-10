/**
 * AuditLogPanel - 操作审计日志（admin 可见）
 *
 * 独立可复用组件：公告管理页"操作日志"Tab 与账户监控页"审计日志"Tab 共用。
 * 分页 + 操作类型过滤，数据来自 IPC AUDIT_LIST。
 */

import React, { useEffect, useState } from 'react'
import { Table, Select, Space, Empty, message, Tag } from 'antd'
import { AuditOutlined } from '@ant-design/icons'
import { IPC_CHANNELS } from '../../../shared/constants'
import { invoke } from '../api/cloudApi'
import { tokens as T } from '../styles/design-tokens'
import type { AuditLog } from '../../../shared/types'

const ACTION_FILTER_OPTIONS = [
  { value: 'login', label: '登录' },
  { value: 'register', label: '注册' },
  { value: 'create_user', label: '创建用户' },
  { value: 'delete_user', label: '删除用户' },
  { value: 'change_password', label: '修改密码' },
  { value: 'create', label: '创建合同/账户' },
  { value: 'update', label: '更新合同' },
  { value: 'delete', label: '删除' },
  { value: 'income', label: '收入' },
  { value: 'expense', label: '支出' },
]

const ACTION_MAP: Record<string, { color: string; label: string }> = {
  login: { color: 'blue', label: '登录' },
  register: { color: 'green', label: '注册' },
  create_user: { color: 'purple', label: '创建用户' },
  delete_user: { color: 'red', label: '删除用户' },
  change_password: { color: 'orange', label: '修改密码' },
  create: { color: 'green', label: '创建' },
  update: { color: 'blue', label: '更新' },
  delete: { color: 'red', label: '删除' },
  income: { color: 'green', label: '收入' },
  expense: { color: 'orange', label: '支出' },
}

const ROLE_MAP: Record<string, { color: string; label: string }> = {
  admin: { color: 'red', label: '管理员' },
  operator: { color: 'blue', label: '操作员' },
  rep: { color: 'green', label: '代表' },
  user: { color: 'default', label: '用户' },
}

const TARGET_MAP: Record<string, string> = {
  user: '用户', contract: '合同', account: '账户', transaction: '交易',
}

const AuditLogPanel: React.FC = () => {
  const [items, setItems] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filterAction, setFilterAction] = useState<string | undefined>()

  const load = async (p = 1) => {
    setLoading(true)
    try {
      const res = await invoke(IPC_CHANNELS.AUDIT_LIST, {
        page: p,
        pageSize: 50,
        action: filterAction || undefined,
      }) as { success: boolean; items: AuditLog[]; total: number }
      if (res.success) {
        setItems(res.items)
        setTotal(res.total)
        setPage(p)
      }
    } catch (err: any) {
      message.error(err?.message || '加载审计日志失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(1) }, [filterAction])

  const columns = [
    { title: '时间', dataIndex: 'timestamp', key: 'timestamp', width: 150,
      render: (v: string) => v?.slice(0, 19) },
    { title: '用户', dataIndex: 'username', key: 'username', width: 90 },
    { title: '角色', dataIndex: 'role', key: 'role', width: 70,
      render: (v: string) => {
        const r = ROLE_MAP[v] || { color: 'default', label: v }
        return <Tag color={r.color}>{r.label}</Tag>
      } },
    { title: '操作', dataIndex: 'action', key: 'action', width: 100,
      render: (v: string) => {
        const a = ACTION_MAP[v] || { color: 'default', label: v }
        return <Tag color={a.color}>{a.label}</Tag>
      } },
    { title: '目标', dataIndex: 'target', key: 'target', width: 70,
      render: (v: string) => TARGET_MAP[v] || v },
    { title: '目标ID', dataIndex: 'target_id', key: 'target_id', width: 70,
      render: (v: number | null) => v ?? '-' },
    { title: '结果', dataIndex: 'result', key: 'result', width: 70,
      render: (v: string) => <Tag color={v === 'success' ? 'green' : 'red'}>{v === 'success' ? '成功' : '失败'}</Tag> },
    { title: 'IP', dataIndex: 'ip', key: 'ip', width: 110, render: (v: string) => v || '-' },
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>
          <AuditOutlined style={{ marginRight: 8 }} />操作审计日志
        </div>
        <Space>
          <Select
            placeholder="操作类型"
            size="small"
            style={{ width: 140 }}
            allowClear
            value={filterAction}
            onChange={(v) => { setFilterAction(v); setPage(1) }}
            options={ACTION_FILTER_OPTIONS}
          />
        </Space>
      </div>

      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4 }}>
        <Table
          dataSource={items}
          rowKey="id"
          columns={columns}
          size="small"
          loading={loading}
          pagination={{
            current: page,
            pageSize: 50,
            total,
            showTotal: (t) => `共 ${t} 条记录`,
            onChange: (p) => load(p),
          }}
          scroll={{ x: 960 }}
          locale={{ emptyText: <Empty description="暂无操作日志" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </div>
    </>
  )
}

export default AuditLogPanel
