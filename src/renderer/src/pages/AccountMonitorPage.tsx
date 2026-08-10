/**
 * AccountMonitorPage - 管理端全系统账户监控
 *
 * 仅 admin 可见：监视软件上所有账号与账户。
 *   Tab1 系统用户：本地数据库 users（角色/创建时间）
 *   Tab2 股票账户：云端股票系统所有账户（余额/持仓/市值/订单）
 *   Tab3 资金账户：本地 fund_accounts（余额/流水）
 *   Tab4 合同概览：本地 contracts（金额/状态/审批）
 *   30 秒自动刷新
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Table, Tag, Button, Card, Drawer, Descriptions, Empty, Spin, message, Tabs } from 'antd'
import { ReloadOutlined, EyeOutlined } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext'
import { CLOUD_ARENA_URL, fetchWithAdminKey } from '../api/cloudApi'
import { invoke } from '../api/cloudApi'
import { IPC_CHANNELS } from '../../../shared/constants'
import AuditLogPanel from '../components/AuditLogPanel'

interface AdminAccount {
  id: number
  username: string
  role: string
  balance: number
  position_count: number
  market_value: number
  total_assets: number
  orders: { cnt: number; buy_qty: number; sell_qty: number }
}

interface AccountDetail {
  user: { id: number; username: string; role: string; balance: number }
  positions: { symbol: string; name: string; quantity: number; avg_price: number; current_price: number }[]
  orders: { id: number; symbol: string; side: string; quantity: number; price: number; status: string; created_at: string }[]
}

/** 本地系统用户 */
interface LocalUser {
  id: number
  username: string
  role: string
  created_at: string
  last_login?: string | null
}

/** 本地资金账户 */
interface FundAccount {
  id: number
  name: string
  region_id?: number | null
  region_name?: string
  balance: number
  created_at: string
}

/** 本地合同 */
interface LocalContract {
  id: number
  contract_no: string
  contract_name: string
  status: string
  total_amount?: number
  region_name?: string
}

const fmtMoney = (v: number): string =>
  v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 系统级指标卡片（管理端顶部行） */
const MetricCard: React.FC<{ label: string; value: string; color?: string; sub?: string }> = ({ label, value, color = '#E2E8F0', sub }) => (
  <div style={{
    background: '#111B2D', border: '1px solid #1E2D40', borderLeft: '3px solid #D4AF37',
    borderRadius: 4, padding: '12px 16px', minWidth: 0,
  }}>
    <div style={{ fontSize: 11, color: '#8A9BB5', marginBottom: 6, lineHeight: 1.5 }}>{label}</div>
    <div style={{
      fontFamily: "'Inter', 'SF Pro Display', 'JetBrains Mono', monospace",
      fontSize: 20, fontWeight: 600, color,
      fontVariantNumeric: 'tabular-nums', lineHeight: 1.2,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {value}
    </div>
    {sub && <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>{sub}</div>}
  </div>
)

/** 30 天前本地时间边界（与 SQLite datetime('now','localtime') 格式对齐） */
function daysAgoLocal(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const AccountMonitorPage: React.FC = () => {
  const auth = useAuth()
  const isAdmin = auth?.role === 'admin'

  const [tab, setTab] = useState('stock')

  // 系统用户
  const [users, setUsers] = useState<LocalUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  // 股票账户
  const [accounts, setAccounts] = useState<AdminAccount[]>([])
  const [loading, setLoading] = useState(false)
  // 资金账户
  const [funds, setFunds] = useState<FundAccount[]>([])
  const [fundsLoading, setFundsLoading] = useState(false)
  // 合同
  const [contracts, setContracts] = useState<LocalContract[]>([])
  const [contractsLoading, setContractsLoading] = useState(false)

  const [detail, setDetail] = useState<AccountDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // ── 云端连接状态：30s 轮询失败去轰炸（首次弹一次 toast，之后静默重试）──
  const [cloudDisconnected, setCloudDisconnected] = useState(false)
  const cloudFailedRef = useRef(false)

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return
    setUsersLoading(true)
    try {
      const r = await invoke(IPC_CHANNELS.AUTH_LIST_USERS) as any
      if (r?.success && Array.isArray(r.users)) setUsers(r.users as LocalUser[])
    } catch (e: any) {
      message.error(`系统用户加载失败：${e?.message || '未知'}`)
    } finally { setUsersLoading(false) }
  }, [isAdmin])

  const loadAccounts = useCallback(async () => {
    if (!isAdmin) return
    setLoading(true)
    try {
      const data = await fetchWithAdminKey(`${CLOUD_ARENA_URL}admin/accounts`)
      setAccounts(Array.isArray(data) ? data : [])
      cloudFailedRef.current = false
      setCloudDisconnected(false)
    } catch (e: any) {
      // 云端故障：仅首次失败弹一次 toast，后续 30s 轮询静默重试
      if (!cloudFailedRef.current) {
        cloudFailedRef.current = true
        message.error(`股票账户加载失败：${e?.message || '网络错误'}`)
      }
      setCloudDisconnected(true)
    } finally { setLoading(false) }
  }, [isAdmin])

  const loadFunds = useCallback(async () => {
    if (!isAdmin) return
    setFundsLoading(true)
    try {
      const r = await invoke(IPC_CHANNELS.ACCOUNT_LIST) as any
      setFunds(Array.isArray(r) ? r as FundAccount[] : [])
    } catch (e: any) {
      message.error(`资金账户加载失败：${e?.message || '未知'}`)
    } finally { setFundsLoading(false) }
  }, [isAdmin])

  const loadContracts = useCallback(async () => {
    if (!isAdmin) return
    setContractsLoading(true)
    try {
      const r = await invoke(IPC_CHANNELS.CONTRACT_LIST) as any
      setContracts(Array.isArray(r) ? r as LocalContract[] : [])
    } catch (e: any) {
      message.error(`合同加载失败：${e?.message || '未知'}`)
    } finally { setContractsLoading(false) }
  }, [isAdmin])

  useEffect(() => { loadUsers(); loadAccounts(); loadFunds(); loadContracts() }, [loadUsers, loadAccounts, loadFunds, loadContracts])

  // 30s 自动刷新
  useEffect(() => {
    if (!isAdmin) return
    const iv = setInterval(() => { loadAccounts(); loadUsers(); loadFunds(); loadContracts() }, 30000)
    return () => clearInterval(iv)
  }, [isAdmin, loadAccounts, loadUsers, loadFunds, loadContracts])

  const openDetail = async (id: number) => {
    setDetailLoading(true)
    setDetail(null)
    try {
      const data = await fetchWithAdminKey(`${CLOUD_ARENA_URL}admin/accounts/${id}`)
      setDetail(data)
    } catch (e: any) {
      message.error(`详情加载失败：${e?.message || '网络错误'}`)
    } finally { setDetailLoading(false) }
  }

  if (!isAdmin) {
    return (
      <Card style={{ background: '#111B2D', borderColor: '#1E2D40', borderRadius: 4 }}>
        <Empty description="账户监控仅管理员可见" style={{ padding: 40 }} />
      </Card>
    )
  }

  const stockColumns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username' },
    { title: '角色', dataIndex: 'role', width: 90, render: (v: string) => <Tag color={v === 'admin' ? 'gold' : v === 'operator' ? 'blue' : 'green'}>{v}</Tag> },
    { title: '现金余额', dataIndex: 'balance', width: 140, align: 'right' as const,
      render: (v: number) => <span style={{ color: '#F5F7FA', fontVariantNumeric: 'tabular-nums' }}>¥{fmtMoney(v || 0)}</span> },
    { title: '持仓数', dataIndex: 'position_count', width: 80, align: 'right' as const },
    { title: '持仓市值', dataIndex: 'market_value', width: 130, align: 'right' as const,
      render: (v: number) => <span style={{ color: '#D4AF37', fontVariantNumeric: 'tabular-nums' }}>¥{fmtMoney(v || 0)}</span> },
    { title: '总资产', dataIndex: 'total_assets', width: 140, align: 'right' as const,
      render: (v: number) => <span style={{ color: '#22C55E', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>¥{fmtMoney(v || 0)}</span> },
    { title: '订单数', dataIndex: ['orders', 'cnt'], width: 80, align: 'right' as const,
      render: (_: unknown, r: AdminAccount) => r.orders?.cnt ?? 0 },
    { title: '操作', key: 'action', width: 80, align: 'center' as const,
      render: (_: unknown, r: AdminAccount) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>详情</Button>
      ) },
  ]

  const userColumns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username' },
    { title: '角色', dataIndex: 'role', width: 100,
      render: (v: string) => <Tag color={v === 'admin' ? 'gold' : v === 'operator' ? 'blue' : 'green'}>{v === 'rep' ? '代表' : v === 'operator' ? '操作员' : '管理员'}</Tag> },
    { title: '创建时间', dataIndex: 'created_at', render: (v: string) => <span style={{ fontSize: 12 }}>{v?.replace('T', ' ')}</span> },
    { title: '最后登录', dataIndex: 'last_login', width: 150,
      render: (v: string | null) => v
        ? <span style={{ fontSize: 12 }}>{v.replace('T', ' ').slice(0, 16)}</span>
        : <span style={{ fontSize: 12, color: '#64748B' }}>从未登录</span> },
  ]

  const fundColumns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '账户名', dataIndex: 'name' },
    { title: '所属区域', dataIndex: 'region_name', render: (v: string) => v || <span style={{ color: '#64748B' }}>未分区</span> },
    { title: '余额', dataIndex: 'balance', align: 'right' as const,
      render: (v: number) => <span style={{ color: '#F5F7FA', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>¥{fmtMoney(v || 0)}</span> },
    { title: '创建时间', dataIndex: 'created_at', render: (v: string) => <span style={{ fontSize: 12 }}>{v?.replace('T', ' ')}</span> },
  ]

  const contractColumns = [
    { title: '编号', dataIndex: 'contract_no', width: 130 },
    { title: '名称', dataIndex: 'contract_name', ellipsis: true },
    { title: '区域', dataIndex: 'region_name', width: 100, render: (v: string) => v || '-' },
    { title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => {
        const map: Record<string, [string, string]> = {
          draft: ['草稿', 'default'], pending: ['待审批', 'gold'], approved: ['已审批', 'blue'],
          active: ['执行中', 'cyan'], completed: ['已完成', 'green'], terminated: ['已终止', 'red'], rejected: ['已驳回', 'volcano'],
        }
        const [label, color] = map[v] || [v, 'default']
        return <Tag color={color}>{label}</Tag>
      } },
  ]

  // ── 系统级指标（顶部卡片行） ──
  const totalAssets = accounts.reduce((s, a) => s + (a.total_assets || 0), 0)
  const totalContractAmount = contracts.reduce((s, c) => s + ((c as any).total_cost || 0), 0)
  const totalFundBalance = funds.reduce((s, f) => s + (f.balance || 0), 0)
  const activeUsers = users.filter(u => u.last_login && u.last_login >= daysAgoLocal(30)).length

  return (
    <div className="page-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: '#E2E8F0' }}>账户监控</span>
        <Tag color="gold">管理端</Tag>
        <span style={{ fontSize: 12, color: '#64748B' }}>
          监视全系统账号与账户 · 系统用户 {users.length} · 股票账户 {accounts.length} · 资金账户 {funds.length} · 合同 {contracts.length}
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => { loadUsers(); loadAccounts(); loadFunds(); loadContracts() }}>刷新</Button>
        </div>
      </div>

      {/* 云端连接中断状态条（轮询失败时显示，避免每 30s 重复弹 toast） */}
      {cloudDisconnected && (
        <div style={{
          marginBottom: 12, padding: '8px 14px', borderRadius: 4,
          background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.25)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: '#E2E8F0',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#D4AF37', flexShrink: 0,
            boxShadow: '0 0 6px rgba(212,175,55,0.8)',
          }} />
          <span style={{ fontWeight: 500 }}>云端连接中断 · 重试中</span>
          <span style={{ color: '#64748B' }}>股票账户数据每 30 秒自动重试，恢复后自动更新</span>
        </div>
      )}

      {/* 系统级指标卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <MetricCard label="股票账户总资产" value={`¥${fmtMoney(totalAssets)}`} color="#22C55E" sub={`${accounts.length} 个云端账户`} />
        <MetricCard label="合同总金额" value={`¥${fmtMoney(totalContractAmount)}`} color="#D4AF37" sub={`${contracts.length} 份合同`} />
        <MetricCard label="资金账户余额" value={`¥${fmtMoney(totalFundBalance)}`} sub={`${funds.length} 个本地账户`} />
        <MetricCard label="活跃用户（30天）" value={String(activeUsers)} color="#60A5FA" sub={`${users.length} 个系统用户`} />
      </div>

      <Card style={{ background: '#111B2D', borderColor: '#1E2D40', borderRadius: 4 }} styles={{ body: { padding: '12px' } }}>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'stock',
              label: `股票账户 (${accounts.length})`,
              children: (
                <Table
                  rowKey="id"
                  dataSource={accounts}
                  columns={stockColumns}
                  loading={loading}
                  size="small"
                  pagination={{ pageSize: 15, showSizeChanger: false }}
                  className="dense-table"
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无股票账户" /> }}
                />
              ),
            },
            {
              key: 'users',
              label: `系统用户 (${users.length})`,
              children: (
                <Table
                  rowKey="id"
                  dataSource={users}
                  columns={userColumns}
                  loading={usersLoading}
                  size="small"
                  pagination={{ pageSize: 15, showSizeChanger: false }}
                  className="dense-table"
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无系统用户" /> }}
                />
              ),
            },
            {
              key: 'funds',
              label: `资金账户 (${funds.length})`,
              children: (
                <Table
                  rowKey="id"
                  dataSource={funds}
                  columns={fundColumns}
                  loading={fundsLoading}
                  size="small"
                  pagination={{ pageSize: 15, showSizeChanger: false }}
                  className="dense-table"
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无资金账户" /> }}
                />
              ),
            },
            {
              key: 'contracts',
              label: `合同概览 (${contracts.length})`,
              children: (
                <Table
                  rowKey="id"
                  dataSource={contracts}
                  columns={contractColumns}
                  loading={contractsLoading}
                  size="small"
                  pagination={{ pageSize: 15, showSizeChanger: false }}
                  className="dense-table"
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无合同" /> }}
                />
              ),
            },
            {
              key: 'audit',
              label: `审计日志`,
              children: <AuditLogPanel />,
            },
          ]}
        />
      </Card>

      {/* 股票账户详情抽屉 */}
      <Drawer
        title={detail ? `股票账户详情 - ${detail.user.username}` : '股票账户详情'}
        width={560}
        open={!!detail}
        onClose={() => setDetail(null)}
        styles={{ body: { background: '#0B1120' }, header: { background: '#0F1729', color: '#E2E8F0', borderBottom: '1px solid #1E2D40' } }}
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : detail ? (
          <>
            <Descriptions column={2} size="small"
              styles={{ label: { color: '#8A9BB5' }, content: { color: '#E2E8F0' } }}
              items={[
                { key: 'id', label: 'ID', children: detail.user.id },
                { key: 'uname', label: '用户名', children: detail.user.username },
                { key: 'role', label: '角色', children: <Tag>{detail.user.role}</Tag> },
                { key: 'bal', label: '现金余额', children: <span style={{ color: '#F5F7FA' }}>¥{fmtMoney(detail.user.balance || 0)}</span> },
              ]}
            />
            <div style={{ marginTop: 20, marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#E2E8F0' }}>
              持仓明细 ({detail.positions.length})
            </div>
            <Table
              rowKey="symbol"
              dataSource={detail.positions}
              size="small"
              pagination={false}
              className="dense-table"
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无持仓" /> }}
              columns={[
                { title: '股票', dataIndex: 'symbol', width: 80 },
                { title: '名称', dataIndex: 'name' },
                { title: '数量', dataIndex: 'quantity', align: 'right', render: (v: number) => v?.toLocaleString() },
                { title: '成本价', dataIndex: 'avg_price', align: 'right', render: (v: number) => v?.toFixed(2) },
                { title: '现价', dataIndex: 'current_price', align: 'right', render: (v: number) => v?.toFixed(2) },
              ]}
            />
            <div style={{ marginTop: 20, marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#E2E8F0' }}>
              订单历史 ({detail.orders.length})
            </div>
            <Table
              rowKey="id"
              dataSource={detail.orders}
              size="small"
              pagination={{ pageSize: 10, showSizeChanger: false }}
              className="dense-table"
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无订单" /> }}
              columns={[
                { title: '时间', dataIndex: 'created_at', width: 120, render: (v: string) => <span style={{ fontSize: 11 }}>{v?.replace('T', ' ')}</span> },
                { title: '股票', dataIndex: 'symbol', width: 80 },
                { title: '方向', dataIndex: 'side', width: 70, render: (v: string) => <Tag color={v === 'buy' ? 'green' : 'red'}>{v === 'buy' ? '买入' : '卖出'}</Tag> },
                { title: '数量', dataIndex: 'quantity', align: 'right' },
                { title: '价格', dataIndex: 'price', align: 'right', render: (v: number) => v?.toFixed(2) },
                { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'filled' ? 'green' : v === 'pending' ? 'gold' : 'default'}>{v}</Tag> },
              ]}
            />
          </>
        ) : null}
      </Drawer>
    </div>
  )
}

export default AccountMonitorPage
