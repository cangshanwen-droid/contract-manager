import React, { useEffect, useState } from 'react'
import {
  Table, Button, Modal, Form, Input, Select, InputNumber, Space,
  Typography, message, Skeleton, Empty, Card, Row, Col, Tag, Divider, Popconfirm, Spin
} from 'antd'
import { PlusOutlined, WalletOutlined, DollarOutlined } from '@ant-design/icons'
import { IPC_CHANNELS } from '../../../shared/constants'
import { PERMISSIONS, hasPermission } from '../../../shared/permissions'
import { api } from '../api/dashboard.api'
import { invoke } from '../api/cloudApi'
import type { Region } from '../../../shared/types'
import { useAuth } from '../context/AuthContext'
import dayjs from 'dayjs'
import { tokens as T } from '../styles/design-tokens'
import { formatMoneyCNY, getColorBySign, POSITIVE_COLOR, NEGATIVE_COLOR } from '../utils/format'

const typeLabels: Record<string,string> = { income:'收入', expense:'支出' }
const typeColors: Record<string,string> = { income:'green', expense:'red' }

const AccountPage: React.FC = () => {
  const user = useAuth()
  // 细粒度权限点（后端同步校验，此处仅为按钮级隐藏）
  const canCreate = hasPermission(user, PERMISSIONS.ACCOUNT_CREATE)
  const canTransact = hasPermission(user, PERMISSIONS.ACCOUNT_TRANSACT)
  const [summary, setSummary] = useState<any>(null)
  const [accounts, setAccounts] = useState<any[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const [txOpen, setTxOpen] = useState(false)
  const [txAccountId, setTxAccountId] = useState<number | null>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [txLoading, setTxLoading] = useState(false)
  const [filterYear, setFilterYear] = useState<number | undefined>()
  const [yearOptions, setYearOptions] = useState<number[]>([])
  const [txForm] = Form.useForm()
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const [s, regs] = await Promise.all([
        invoke(IPC_CHANNELS.ACCOUNT_SUMMARY) as Promise<any>,
        api.region.list()
      ])
      setSummary(s)
      setAccounts(s?.accounts || [])
      setRegions(regs as Region[])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // 年度筛选动态化：从 account_transactions 表读取全部年度，无数据时回退当前年份
  useEffect(() => {
    invoke(IPC_CHANNELS.ACCOUNT_YEARS)
      .then((ys: any) => {
        const years = Array.isArray(ys) ? ys.filter((y: any) => typeof y === 'number') : []
        setYearOptions(years.length > 0 ? years : [new Date().getFullYear()])
      })
      .catch(() => setYearOptions([new Date().getFullYear()]))
  }, [])

  // ── 快捷键：Escape 关闭弹窗 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (createOpen) setCreateOpen(false)
        if (txOpen) setTxOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createOpen, txOpen])

  const openTx = async (accountId: number) => {
    setTxAccountId(accountId)
    setFilterYear(undefined)
    setTxOpen(true)
    setTxLoading(true)
    try {
      const txs = await invoke(IPC_CHANNELS.ACCOUNT_TRANSACTIONS, accountId) as any[]
      setTransactions(txs)
    } finally { setTxLoading(false) }
  }

  const handleFilterYear = async (year?: number) => {
    setFilterYear(year)
    if (!txAccountId) return
    setTxLoading(true)
    try {
      const txs = await invoke(IPC_CHANNELS.ACCOUNT_TRANSACTIONS, txAccountId, year) as any[]
      setTransactions(txs)
    } finally { setTxLoading(false) }
  }

  const handleAddTx = async () => {
    try {
      const vals = await txForm.validateFields()
      await invoke(IPC_CHANNELS.ACCOUNT_ADD_TRANSACTION, {
        account_id: txAccountId!,
        trans_type: vals.trans_type,
        category: vals.category || '',
        amount: vals.amount,
        description: vals.description || '',
        fiscal_year: vals.fiscal_year ?? null,
        operator: user?.username || ''
      })
      message.success('交易记录已添加')
      txForm.resetFields()
      load() // refresh balances
      openTx(txAccountId!)
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || '操作失败')
    }
  }

  const handleCreate = async () => {
    try {
      const vals = await createForm.validateFields()
      const r = await invoke(IPC_CHANNELS.ACCOUNT_CREATE, vals) as any
      if (!r.success) { message.error(r.message); return }
      message.success('账户创建成功')
      createForm.resetFields()
      setCreateOpen(false)
      load()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || '创建失败')
    }
  }

  const cardStyle: React.CSSProperties = {
    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4,
    padding: '18px 20px'
  }

  const columns = [
    { title: '账户名', dataIndex: 'account_name', key: 'name' },
    { title: '所属区域', dataIndex: 'region_name', key: 'region',
      render: (v: string) => v || <span style={{color:T.textMuted}}>主账户</span> },
    { title: '余额', dataIndex: 'balance', key: 'balance', align: 'right' as const,
      sorter: (a: any, b: any) => (a.balance || 0) - (b.balance || 0),
      render: (v: number) => (
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, fontSize: 14, color: getColorBySign(v) }}>
          {formatMoneyCNY(v)}
        </span>
      )},
    { title: '主账户', dataIndex: 'is_master', key: 'master', width: 80,
      render: (v: number) => v ? <Tag color="gold">主</Tag> : '' },
    { title: '操作', width: 100, key: 'action',
      render: (_:unknown, r:any) => (
        <Button type="link" size="small" icon={<WalletOutlined />} onClick={() => openTx(r.id)}>流水</Button>
      )},
  ]

  const txColumns = [
    { title: '时间', dataIndex: 'created_at', key: 'time', width: 140,
      render: (v:string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '' },
    { title: '类型', dataIndex: 'trans_type', key: 'type', width: 60,
      render: (v:string) => <Tag color={typeColors[v]}>{typeLabels[v]||v}</Tag> },
    { title: '分类', dataIndex: 'category', key: 'cat', width: 80 },
    { title: '来源', dataIndex: 'source_type', key: 'source', width: 70,
      render: (v:string, r:any) => r.contract_id
        ? <Tag color="blue">合同 #{r.contract_id}</Tag>
        : <Tag color="default">手动</Tag> },
    { title: '金额', dataIndex: 'amount', key: 'amount', align: 'right' as const, width: 120,
      sorter: (a: any, b: any) => (a.amount || 0) - (b.amount || 0),
      render: (v:number, r:any) => (
        <span style={{ color: r.trans_type==='income' ? POSITIVE_COLOR : NEGATIVE_COLOR, fontFamily:'JetBrains Mono,monospace' }}>
          {r.trans_type==='income'?'+':'-'} {formatMoneyCNY(v).replace('¥', '')}
        </span>
      )},
    { title: '描述', dataIndex: 'description', key: 'desc', ellipsis: true },
    { title: '年度', dataIndex: 'fiscal_year', key: 'year', width: 60 },
  ]

  return (
    <div className="page-fade-in">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div className="section-title" style={{ margin:0, border:'none', padding:0 }}>{canCreate ? '资金账户' : '资金总览（只读）'}</div>
        {canCreate && <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建账户</Button>}
      </div>

      {loading ? (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {[1,2,3,4].map(i => (
            <Col span={6} key={i}>
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4, padding: '18px 20px' }}>
                <Skeleton.Input active size="small" style={{ width: 60, marginBottom: 8 }} />
                <Skeleton.Input active style={{ width: 120, height: 22 }} />
              </div>
            </Col>
          ))}
        </Row>
      ) : summary && (
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <div style={cardStyle}>
                <div style={{ fontSize:11, color:T.textMuted, marginBottom:4 }}>总余额</div>
                <div style={{ fontSize:22, fontWeight:600, fontFamily:'JetBrains Mono,monospace', color:T.warmGold }}>
                  {formatMoneyCNY(Number(summary.total_balance??0))}
                </div>
              </div>
            </Col>
            <Col span={6}>
              <div style={cardStyle}>
                <div style={{ fontSize:11, color:T.textMuted, marginBottom:4 }}>账户数</div>
                <div style={{ fontSize:22, fontWeight:600, color:T.textPrimary }}>
                  {accounts.length} 个
                </div>
              </div>
            </Col>
            <Col span={6}>
              <div style={cardStyle}>
                <div style={{ fontSize:11, color:T.textMuted, marginBottom:4 }}>区域账户</div>
                <div style={{ fontSize:22, fontWeight:600, color:T.textPrimary }}>
                  {summary.region_count ?? 0} 个
                </div>
              </div>
            </Col>
            <Col span={6}>
              <div style={cardStyle}>
                <div style={{ fontSize:11, color:T.textMuted, marginBottom:4 }}>主账户</div>
                <div style={{ fontSize:22, fontWeight:600, color:T.textPrimary }}>
                  {accounts.filter((a:any)=>a.is_master).length} 个
                </div>
              </div>
            </Col>
          </Row>
        )}

        {/* Account table */}
        {loading ? (
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4, padding: 16 }}>
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : (
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4 }}>
            <Table
              dataSource={accounts}
              rowKey="id" columns={columns}
              pagination={false} size="small"
              locale={{ emptyText:
              <div style={{ padding: '24px 0' }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <div>
                      <span style={{ color: T.textPrimary, fontSize: 14, fontWeight: 500 }}>
                        暂无资金账户
                      </span>
                      <br />
                      <span style={{ color: T.textMuted, fontSize: 12 }}>
                        创建账户以管理区域资金流水
                      </span>
                    </div>
                  }
                >
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                    新建账户
                  </Button>
                </Empty>
              </div>
            }}
          />
        </div>
      )}

      {/* Create Account Modal */}
      <Modal
        title="新建资金账户"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        okText="创建"
        width={420}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" size="small">
          <Form.Item name="account_name" label="账户名称" rules={[{required:true, message:'请输入账户名称'}]}>
            <Input placeholder="例如：A区基建专户" />
          </Form.Item>
          <Form.Item name="region_id" label="所属区域" rules={[{required:true, message:'请选择区域'}]}>
            <Select placeholder="选择区域"
              options={regions.map(r=>({value:r.id,label:r.name}))} />
          </Form.Item>
          <Form.Item name="is_master" label="账户类型" initialValue={0}>
            <Select options={[{value:0,label:'区域账户'},{value:1,label:'主账户'}]} />
          </Form.Item>
          <Form.Item name="initial_balance" label="初始余额" initialValue={0}>
            <InputNumber style={{width:'100%'}} min={0} placeholder="¥ 0" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Transaction Modal */}
      <Modal
        title={`交易流水${filterYear ? ` · ${filterYear}年` : ''}`}
        open={txOpen} onCancel={() => setTxOpen(false)}
        footer={null} width={760}
        destroyOnHidden
      >
        <div style={{ marginBottom: 12, display:'flex', gap:8 }}>
          <Select placeholder="筛选年度" size="small" style={{ width:100 }} allowClear
            value={filterYear} onChange={handleFilterYear}
            options={yearOptions.map(y => ({ value: y, label: `${y}年` }))} />
        </div>
        <Spin spinning={txLoading}>
          <Table
            dataSource={transactions} rowKey="id" columns={txColumns}
            pagination={{ pageSize: 10 }} size="small"
            locale={{ emptyText: <span style={{color:T.textMuted,fontSize:11}}>暂无交易记录</span> }}
          />
        </Spin>
        {canTransact && (
          <>
            <Divider />
            <div style={{ fontSize:13, fontWeight:500, color:T.textSecondary, marginBottom:8 }}>添加交易</div>
            <Form form={txForm} layout="inline" size="small" onFinish={handleAddTx}>
              <Form.Item name="trans_type" rules={[{required:true}]} style={{marginBottom:8}}>
                <Select style={{width:80}} options={[{value:'income',label:'收入'},{value:'expense',label:'支出'}]} />
              </Form.Item>
              <Form.Item name="amount" rules={[{required:true}]} style={{marginBottom:8}}>
                <InputNumber placeholder="金额" min={0} style={{width:100}} />
              </Form.Item>
              <Form.Item name="category" style={{marginBottom:8}}>
                <Select placeholder="类别" style={{width:120}} allowClear
                  options={[
                    {value:'基建拨款',label:'基建拨款'},
                    {value:'投资支出',label:'投资支出'},
                    {value:'采购支出',label:'采购支出'},
                    {value:'劳动力支出',label:'劳动力支出'},
                    {value:'碳排交易',label:'碳排交易'},
                    {value:'税收收入',label:'税收收入'},
                    {value:'拨款收入',label:'拨款收入'},
                  ]} />
              </Form.Item>
              <Form.Item name="fiscal_year" style={{marginBottom:8}}>
                <InputNumber placeholder="年度" min={2020} max={2030} style={{width:80}} />
              </Form.Item>
              <Form.Item name="description" style={{marginBottom:8}}>
                <Input placeholder="备注" style={{width:140}} />
              </Form.Item>
              <Form.Item style={{marginBottom:8}}>
                <Button type="primary" htmlType="submit" icon={<DollarOutlined />}>添加</Button>
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </div>
  )
}

export default AccountPage
