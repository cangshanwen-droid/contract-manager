import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Drawer, Empty, Input, InputNumber, Modal, Select, Spin, Table, Tag, message } from 'antd'
import {
  BankOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ControlOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  StockOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { IPC_CHANNELS } from '../../../../shared/constants'
import { createStock } from '../../api/cloudApi'
import { companyApi } from '../../api/company.api'
import type { Company } from '../../../../shared/types'

type AdminView = 'control' | 'securities' | 'accounts' | 'audit'
type AdminOverview = {
  api?: string
  database?: string
  writes_enabled?: boolean
  state?: string
  round?: number
  users?: number
  operators?: number
  admins?: number
  stocks?: number
  orders?: number
  recent_order?: Record<string, unknown> | null
}
type AdminStock = {
  id?: number
  symbol: string
  name?: string
  current_price?: number
  sector?: string
  is_active?: number
}
type AdminAccount = {
  id: number
  company_name?: string
  user_count?: number
  balance?: number
  market_value?: number
  total_assets?: number
  position_count?: number
}
type AuditRow = { id: number; action: string; detail?: string; created_at?: string }

type Props = {
  open: boolean
  onClose: () => void
  onMarketChanged: () => void
  onOpenFunds: () => void
}

const fmtMoney = (value: number | undefined) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function adminCall<T>(action: string, symbol = ''): Promise<T> {
  const result = await window.api.invoke(IPC_CHANNELS.STOCK_ADMIN, { action, symbol }) as { success?: boolean; data?: T; message?: string }
  if (!result?.success) throw new Error(result?.message || '管理操作失败')
  return result.data as T
}

export default function StockAdminConsole({ open, onClose, onMarketChanged, onOpenFunds }: Props) {
  const navigate = useNavigate()
  const [view, setView] = useState<AdminView>('control')
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState('')
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [stocks, setStocks] = useState<AdminStock[]>([])
  const [accounts, setAccounts] = useState<AdminAccount[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [listingCompanyId, setListingCompanyId] = useState<number | null>(null)
  const [listingSymbol, setListingSymbol] = useState('')
  const [listingPrice, setListingPrice] = useState<number>(100)
  const [listingSector, setListingSector] = useState('基础设施')
  const [listingSubmitting, setListingSubmitting] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled([
      adminCall<AdminOverview>('overview'),
      adminCall<AdminStock[]>('stocks'),
      adminCall<AdminAccount[]>('accounts'),
      adminCall<AuditRow[]>('audit'),
      companyApi.list(),
    ])
    if (results[0].status === 'fulfilled') setOverview(results[0].value)
    if (results[1].status === 'fulfilled') setStocks(results[1].value)
    if (results[2].status === 'fulfilled') setAccounts(results[2].value)
    if (results[3].status === 'fulfilled') setAudit(results[3].value)
    if (results[4].status === 'fulfilled') setCompanies(results[4].value)
    const failures = results.filter((item) => item.status === 'rejected').length
    if (failures) message.warning(`${failures} 项管理数据暂未同步，可点击刷新重试`)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) void reload()
  }, [open, reload])

  const runMarketAction = useCallback(async (action: 'close' | 'open' | 'previous' | 'reset') => {
    setActionLoading(action)
    try {
      await adminCall(action)
      message.success(action === 'close' ? '本轮已收盘结算' : action === 'open' ? '下一轮已经开启' : action === 'previous' ? '已回到上一轮' : '市场已回到第 1 轮')
      await reload()
      onMarketChanged()
    } catch (error: any) {
      message.error(error?.message || '轮次操作失败')
    } finally {
      setActionLoading('')
    }
  }, [onMarketChanged, reload])

  const confirmReset = () => {
    Modal.confirm({
      title: '确认回到第 1 轮？',
      content: '该操作会清空股票成交与持仓记录，但不会删除用户、公司或股票。操作完成后无法撤销。',
      okText: '确认重置',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => runMarketAction('reset'),
    })
  }

  const submitListing = useCallback(async () => {
    const company = companies.find((item) => item.id === listingCompanyId)
    const symbol = listingSymbol.trim().toUpperCase()
    if (!company) return message.warning('请选择准备上市的公司')
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(symbol)) return message.warning('证券代码须为 2–10 位大写字母或数字，并以字母开头')
    if (!listingPrice || listingPrice <= 0) return message.warning('请输入有效的发行价格')
    setListingSubmitting(true)
    try {
      await companyApi.update(company.id, { is_listed: 1, stock_symbol: symbol, stock_initial_price: listingPrice })
      try {
        await createStock({ symbol, name: company.name, price: listingPrice, sector: listingSector.trim() || '基础设施' })
      } catch (error: any) {
        if (error?.rollbackSafe) await companyApi.update(company.id, { is_listed: 0, stock_symbol: '', stock_initial_price: 100 })
        throw error
      }
      message.success(`${company.name} 已上市，证券代码 ${symbol}`)
      setListingCompanyId(null)
      setListingSymbol('')
      setListingPrice(100)
      await reload()
      onMarketChanged()
    } catch (error: any) {
      message.error(error?.message || '创建股票失败')
    } finally {
      setListingSubmitting(false)
    }
  }, [companies, listingCompanyId, listingPrice, listingSector, listingSymbol, onMarketChanged, reload])

  const deleteStock = useCallback((stock: AdminStock) => {
    Modal.confirm({
      title: `下市 ${stock.symbol}？`,
      content: '仅在该股票没有任何持仓时允许下市；公司上市状态会同步更新。',
      okText: '确认下市',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const company = companies.find((item) => item.stock_symbol === stock.symbol)
        if (company) await companyApi.update(company.id, { is_listed: 0, stock_symbol: '', stock_initial_price: 100 })
        try {
          await adminCall('delete-stock', stock.symbol)
        } catch (error) {
          if (company) await companyApi.update(company.id, { is_listed: 1, stock_symbol: stock.symbol, stock_initial_price: stock.current_price || 100 })
          throw error
        }
        message.success(`${stock.symbol} 已下市`)
        await reload()
        onMarketChanged()
      },
    })
  }, [companies, onMarketChanged, reload])

  const tabs: { key: AdminView; label: string; icon: React.ReactNode }[] = [
    { key: 'control', label: '赛程控制', icon: <ControlOutlined /> },
    { key: 'securities', label: '证券管理', icon: <StockOutlined /> },
    { key: 'accounts', label: '账户监控', icon: <TeamOutlined /> },
    { key: 'audit', label: '审计日志', icon: <HistoryOutlined /> },
  ]

  const healthCells = [
    ['API 服务', overview?.api === 'ok' ? '正常' : '待检查'],
    ['数据库', overview?.database === 'ok' ? '正常' : '待检查'],
    ['写入权限', overview?.writes_enabled ? '已开启' : '未开启'],
    ['当前轮次', `第 ${overview?.round || 1} 轮`],
    ['市场状态', overview?.state === 'open' ? '交易中' : '已收盘'],
    ['上市证券', `${overview?.stocks || 0} 只`],
  ]

  return (
    <Drawer
      className="gipfel-security-drawer"
      title={<div className="gipfel-security-drawer__title"><SafetyCertificateOutlined /><span>市场管理控制台</span><small>轮次、证券、账户与审计统一管理</small></div>}
      width="min(980px, calc(100vw - 24px))"
      open={open}
      onClose={onClose}
      extra={<Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void reload()}>刷新</Button>}
    >
      <nav className="gipfel-admin__tabs" aria-label="市场管理功能">
        {tabs.map((tab) => <button key={tab.key} className={view === tab.key ? 'is-active' : ''} onClick={() => setView(tab.key)}>{tab.icon}<span>{tab.label}</span></button>)}
      </nav>

      {view === 'control' && <div className="gipfel-admin__view">
        <section className="gipfel-admin__section">
          <div className="gipfel-admin__section-head"><div><h3>赛前检查</h3><p>确认服务、数据库、写权限与当前市场状态</p></div><Tag color={overview?.state === 'open' ? 'green' : 'default'}>{overview?.state === 'open' ? '交易中' : '已收盘'}</Tag></div>
          <div className="gipfel-admin__health-grid">
            {healthCells.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
        </section>
        <section className="gipfel-admin__section">
          <div className="gipfel-admin__section-head"><div><h3>市场轮次控制</h3><p>一轮完成收盘结算后，才能开启下一轮</p></div><b>第 {overview?.round || 1} 轮</b></div>
          <div className="gipfel-admin__round-actions">
            <Button icon={<CloseCircleOutlined />} loading={actionLoading === 'close'} disabled={overview?.state !== 'open'} onClick={() => void runMarketAction('close')}>收盘结算</Button>
            <Button type="primary" icon={<CheckCircleOutlined />} loading={actionLoading === 'open'} disabled={overview?.state !== 'closed'} onClick={() => void runMarketAction('open')}>开启下一轮</Button>
            <Button icon={<RollbackOutlined />} loading={actionLoading === 'previous'} disabled={(overview?.round || 1) <= 1} onClick={() => void runMarketAction('previous')}>返回上一轮</Button>
            <Button danger icon={<DeleteOutlined />} loading={actionLoading === 'reset'} onClick={confirmReset}>回到第 1 轮</Button>
          </div>
          <Alert type="warning" showIcon message="回退保护" description="当前轮次已有成交时禁止直接返回上一轮，避免资金与持仓错账；需要重开赛程时使用“回到第 1 轮”。" />
        </section>
      </div>}

      {view === 'securities' && <div className="gipfel-admin__view">
        <section className="gipfel-admin__section">
          <div className="gipfel-admin__section-head"><div><h3>创建上市证券</h3><p>公司目录与股票市场在同一事务流程中同步</p></div><DatabaseOutlined /></div>
          <div className="gipfel-security-drawer__form">
            <label><span>上市公司</span><Select value={listingCompanyId} placeholder="选择未上市公司" onChange={setListingCompanyId} options={companies.filter((company) => !company.is_listed).map((company) => ({ value: company.id, label: `${company.name} · ${company.region || '未分区'}` }))} /></label>
            <div className="gipfel-security-drawer__row">
              <label><span>证券代码</span><Input value={listingSymbol} maxLength={10} placeholder="例如 JGONG" onChange={(event) => setListingSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></label>
              <label><span>发行价格（元）</span><InputNumber min={0.01} precision={2} prefix="¥" value={listingPrice} onChange={(value) => setListingPrice(value ?? 100)} /></label>
            </div>
            <label><span>所属板块</span><Input value={listingSector} maxLength={24} onChange={(event) => setListingSector(event.target.value)} /></label>
            <Button type="primary" icon={<PlusOutlined />} loading={listingSubmitting} disabled={!listingCompanyId || !listingSymbol} onClick={() => void submitListing()}>创建并上市</Button>
          </div>
        </section>
        <section className="gipfel-admin__section">
          <div className="gipfel-admin__section-head"><div><h3>证券目录</h3><p>{stocks.filter((item) => item.is_active).length} 只交易中 · {stocks.filter((item) => !item.is_active).length} 只已下市</p></div></div>
          <Table size="small" rowKey="symbol" pagination={false} dataSource={stocks} columns={[
            { title: '代码', dataIndex: 'symbol', width: 110 },
            { title: '名称', dataIndex: 'name' },
            { title: '板块', dataIndex: 'sector', width: 130 },
            { title: '现价', dataIndex: 'current_price', width: 120, render: (value: number) => fmtMoney(value) },
            { title: '状态', dataIndex: 'is_active', width: 90, render: (value: number) => <Tag color={value ? 'green' : 'default'}>{value ? '交易中' : '已下市'}</Tag> },
            { title: '操作', width: 90, render: (_: unknown, stock: AdminStock) => stock.is_active ? <Button type="text" danger size="small" onClick={() => deleteStock(stock)}>下市</Button> : null },
          ]} />
        </section>
      </div>}

      {view === 'accounts' && <div className="gipfel-admin__view">
        <section className="gipfel-admin__section">
          <div className="gipfel-admin__section-head"><div><h3>股票账户总览</h3><p>公司资金、持仓市值和账户使用情况</p></div><div className="gipfel-admin__head-actions"><Button onClick={onOpenFunds}>资金调度</Button><Button type="primary" onClick={() => { onClose(); navigate('/users') }}>统一用户管理</Button></div></div>
          <Table size="small" rowKey="id" pagination={false} dataSource={accounts} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无股票账户" /> }} columns={[
            { title: '公司账户', dataIndex: 'company_name' },
            { title: '关联用户', dataIndex: 'user_count', width: 100 },
            { title: '可用资金', dataIndex: 'balance', width: 150, render: (value: number) => fmtMoney(value) },
            { title: '持仓市值', dataIndex: 'market_value', width: 150, render: (value: number) => fmtMoney(value) },
            { title: '总资产', dataIndex: 'total_assets', width: 150, render: (value: number) => <strong>{fmtMoney(value)}</strong> },
          ]} />
        </section>
      </div>}

      {view === 'audit' && <div className="gipfel-admin__view">
        <section className="gipfel-admin__section">
          <div className="gipfel-admin__section-head"><div><h3>市场审计日志</h3><p>记录轮次控制、证券上下市等管理操作</p></div><HistoryOutlined /></div>
          <Table size="small" rowKey="id" pagination={{ pageSize: 12, hideOnSinglePage: true }} dataSource={audit} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无管理操作记录" /> }} columns={[
            { title: '时间', dataIndex: 'created_at', width: 170 },
            { title: '操作', dataIndex: 'action', width: 160 },
            { title: '详情', dataIndex: 'detail' },
          ]} />
        </section>
      </div>}
      {loading && !overview && <div className="gipfel-admin__loading"><Spin /><span>正在同步管理数据</span></div>}
    </Drawer>
  )
}
