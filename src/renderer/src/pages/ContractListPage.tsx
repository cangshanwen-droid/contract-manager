import React, { useEffect, useState, useRef } from 'react'
import {
  Table, Button, Modal, Form, Input, Select, DatePicker, Space, Popconfirm, Dropdown, Tooltip,
  Typography, message, Skeleton, Empty, Tag, InputNumber, Card, Row, Col, Divider, Checkbox, Tabs, Segmented
} from 'antd'
import type { MenuProps } from 'antd'
import { PlusOutlined, DeleteOutlined, EyeOutlined, EditOutlined, SearchOutlined, FilterOutlined, HistoryOutlined, SendOutlined, CheckCircleOutlined, StopOutlined, PlayCircleOutlined, MoreOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { IPC_CHANNELS } from '../../../shared/constants'
import { PERMISSIONS, hasPermission } from '../../../shared/permissions'
import { api } from '../api/dashboard.api'
import { invoke } from '../api/cloudApi'
import { tokens as T } from '../styles/design-tokens'
import { formatMoneyCNY, formatNumber, POSITIVE_COLOR, NEGATIVE_COLOR } from '../utils/format'
import type { Contract, ContractWithItems, Company, Region, ContractType, ContractVersion, ContractItem } from '../../../shared/types'
import { useAuth } from '../context/AuthContext'
import dayjs from 'dayjs'

const statusColors: Record<string, string> = {
  draft: 'default', active: 'processing', completed: 'success',
  terminated: 'error', expired: 'warning'
}
const statusLabels: Record<string, string> = {
  draft: '草稿', active: '执行中', completed: '已完成',
  terminated: '已终止', expired: '已过期'
}
// 审批状态：none=未提交 pending=待审批 approved=已审批 rejected=已驳回
const approvalLabels: Record<string, string> = {
  none: '未提交', pending: '待审批', approved: '已审批', rejected: '已驳回'
}

// 完整状态机视图：审批状态 + 执行状态组合成展示态
// 草稿 → 待审批 → 已审批 → 执行中 → 已完成/已终止
function contractState(c: Contract): { key: string; label: string; color: string } {
  if (c.approval_status === 'pending') return { key: 'pending', label: '待审批', color: 'processing' }
  if (c.approval_status === 'rejected') return { key: 'rejected', label: '已驳回', color: 'error' }
  if (c.approval_status === 'approved') {
    switch (c.status) {
      case 'active': return { key: 'active', label: '执行中', color: 'processing' }
      case 'completed': return { key: 'completed', label: '已完成', color: 'success' }
      case 'terminated': return { key: 'terminated', label: '已终止', color: 'error' }
      case 'expired': return { key: 'expired', label: '已过期', color: 'warning' }
      default: return { key: 'approved', label: '已审批', color: 'success' }
    }
  }
  // 未提交审批（草稿）或历史数据（无审批列，默认视为已审批）
  const s = c.status || 'draft'
  return { key: s, label: statusLabels[s] || s, color: statusColors[s] || 'default' }
}

// 快照字段中文名映射（版本历史展示用）
const FIELD_LABELS: Record<string, string> = {
  contract_no: '合同编号',
  contract_name: '合同名称',
  contract_type_id: '合同类型',
  contract_type_name: '合同类型',
  party_a: '甲方',
  party_b_id: '签约公司',
  party_b_name: '签约公司',
  company_name: '签约公司',
  region_id: '所属区域',
  region_name: '所属区域',
  sign_date: '签约日期',
  status: '状态',
  notes: '备注',
  total_cost: '总成本',
  progress: '进度',
  expected_income: '预期收益',
  items: '明细项'
}
const SNAPSHOT_FIELDS: [string, string][] = [
  ['contract_no', '合同编号'],
  ['contract_name', '合同名称'],
  ['contract_type_name', '合同类型'],
  ['party_a', '甲方'],
  ['company_name', '签约公司'],
  ['region_name', '所属区域'],
  ['sign_date', '签约日期'],
  ['status', '状态'],
  ['notes', '备注'],
  ['total_cost', '总成本'],
  ['progress', '进度'],
  ['expected_income', '预期收益']
]

const ContractListPage: React.FC = () => {
  const user = useAuth()
  // 细粒度权限点（后端同步校验，此处仅为按钮级隐藏）
  const canCreate = hasPermission(user, PERMISSIONS.CONTRACT_CREATE)
  const canEdit = hasPermission(user, PERMISSIONS.CONTRACT_EDIT)
  const canApprove = hasPermission(user, PERMISSIONS.CONTRACT_APPROVE)
  const [searchParams] = useSearchParams()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractTypes, setContractTypes] = useState<ContractType[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  // ── 批量操作：行选择 + 批量栏 ──
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [batchAction, setBatchAction] = useState<'' | 'submit' | 'approve' | 'delete'>('')
  const batchBusy = batchAction !== ''
  const [formOpen, setFormOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<ContractWithItems | null>(null)
  const [versions, setVersions] = useState<ContractVersion[]>([])
  const [versionDetail, setVersionDetail] = useState<ContractVersion | null>(null)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [approvalContract, setApprovalContract] = useState<Contract | null>(null)
  const [approvalSubmitting, setApprovalSubmitting] = useState(false)
  const [companies, setCompanies] = useState<Company[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [contractTypeId, setContractTypeId] = useState<number | null>(null)
  const [items, setItems] = useState<Partial<any>[]>([])
  const [editItems, setEditItems] = useState<Partial<ContractItem>[]>([])
  const [form] = Form.useForm()
  const nameInputRef = useRef<any>(null)
  // 支持 URL 参数：?q=搜索词 &status=快捷筛选（Dashboard 待办工作台跳转）
  const [searchText, setSearchText] = useState(searchParams.get('q') || '')
  const [quickFilter, setQuickFilter] = useState<string>(
    ['pending', 'active', 'expired', 'todo', 'draft'].includes(searchParams.get('status') || '')
      ? (searchParams.get('status') as string)
      : 'all'
  )
  const [filterType, setFilterType] = useState<number | undefined>()
  const [filterRegion, setFilterRegion] = useState<number | undefined>()

  const load = async () => {
    setLoading(true)
    try {
      const [ctList, comps, regs, contractsList] = await Promise.all([
        api.contractType.list(),
        api.company.list(),
        api.region.list(),
        invoke(IPC_CHANNELS.CONTRACT_LIST) as Promise<Contract[]>
      ])
      setContractTypes(ctList as ContractType[])
      setCompanies(comps as Company[])
      setRegions(regs as Region[])
      setContracts(contractsList)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setFormOpen(false); setEditOpen(false); setDetailOpen(false) }
      if (e.ctrlKey && e.key === 'n') { e.preventDefault(); if (canCreate) openCreate() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canCreate])

  // 快捷筛选映射：'todo' = 我的待办（草稿 + 待审批 + 已驳回待重提）
  const quickFilterMatch = (c: Contract): boolean => {
    const key = contractState(c).key
    if (quickFilter === 'all') return true
    if (quickFilter === 'todo') return key === 'draft' || key === 'pending' || key === 'rejected'
    return key === quickFilter
  }

  // Filtered contracts
  const filteredContracts = contracts.filter(c => {
    if (!quickFilterMatch(c)) return false
    if (searchText && !c.contract_no?.toLowerCase().includes(searchText.toLowerCase()) &&
        !c.contract_name?.toLowerCase().includes(searchText.toLowerCase())) return false
    if (filterType && c.contract_type_id !== filterType) return false
    if (filterRegion && c.region_id !== filterRegion) return false
    return true
  })

  const openCreate = () => {
    setContractTypeId(null); setItems([]); form.resetFields(); setFormOpen(true)
  }

  // 新建弹窗打开后默认聚焦第一个输入框（合同名称）- 数据录入效率
  useEffect(() => {
    if (formOpen) {
      const timer = setTimeout(() => { nameInputRef.current?.focus() }, 80)
      return () => clearTimeout(timer)
    }
  }, [formOpen])

  const openEdit = async (c: Contract) => {
    try {
      const full = await invoke(IPC_CHANNELS.CONTRACT_GET, c.id) as ContractWithItems
      setEditingContract({ ...c, ...full })
      setEditItems((full.items || []).map(i => ({ ...i })))
    } catch {
      setEditingContract(c)
      setEditItems([])
    }
    setEditOpen(true)
  }

  const updateEditItem = (idx: number, field: string, value: unknown) => {
    setEditItems(prev => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
  }

  const handleEditSave = async () => {
    if (!editingContract) return
    setEditSubmitting(true)
    try {
      const res = await invoke(IPC_CHANNELS.CONTRACT_UPDATE, editingContract.id, {
        contract_name: editingContract.contract_name,
        notes: editingContract.notes,
        items: editItems.map(it => ({
          item_name: it.item_name,
          quantity: it.quantity,
          unit_price: it.unit_price,
          land_area: it.land_area,
          tax_rate: it.tax_rate,
          skill_level: it.skill_level,
          carbon_factor: it.carbon_factor
        })),
        updated_by: user?.username || ''
      })
      if (res && res.success === false) { message.error(res.message || '更新失败'); return }
      setContracts(prev => prev.map(c => c.id === editingContract.id ? { ...c, ...editingContract } : c))
      message.success('更新成功')
      setEditOpen(false)
    } catch {
      message.error('更新失败')
    } finally {
      setEditSubmitting(false)
    }
  }

  // 审批操作：submit(提交审批) / approve(批准) / reject(驳回)
  const handleApproval = async (id: number, action: 'submit' | 'approve' | 'reject') => {
    try {
      const res = await invoke(IPC_CHANNELS.CONTRACT_APPROVE, id, action, user?.username || '', user?.role || '')
      if (res && res.success === false) { message.error(res.message || '操作失败'); return }
      const updated = res as Contract
      setContracts(prev => prev.map(c => c.id === id ? updated : c))
      message.success(action === 'submit' ? '已提交审批' : action === 'approve' ? '审批通过' : '已驳回')
    } catch (err: any) {
      message.error(err?.message || '操作失败')
    }
  }

  // 打开审批确认弹窗
  const openApprovalModal = (c: Contract) => {
    setApprovalContract(c)
    setApprovalOpen(true)
  }

  // 弹窗内批准/驳回（单级审批）
  const doApprove = async (action: 'approve' | 'reject') => {
    if (!approvalContract) return
    setApprovalSubmitting(true)
    try {
      const res = await invoke(IPC_CHANNELS.CONTRACT_APPROVE, approvalContract.id, action, user?.username || '', user?.role || '')
      if (res && res.success === false) { message.error(res.message || '操作失败'); return }
      const updated = res as Contract
      setContracts(prev => prev.map(c => c.id === approvalContract.id ? updated : c))
      setApprovalOpen(false)
      message.success(action === 'approve' ? '审批通过' : '已驳回')
    } catch (err: any) {
      message.error(err?.message || '操作失败')
    } finally {
      setApprovalSubmitting(false)
    }
  }

  // 执行状态流转：开始执行 / 完成 / 终止（仅已审批合同可操作）
  const handleLifecycle = async (id: number, status: string) => {
    try {
      const res = await invoke(IPC_CHANNELS.CONTRACT_UPDATE, id, { status, updated_by: user?.username || '' })
      if (res && res.success === false) { message.error(res.message || '状态更新失败'); return }
      setContracts(prev => prev.map(c => c.id === id ? { ...c, status } : c))
      message.success('状态已更新')
    } catch (err: any) {
      message.error(err?.message || '状态更新失败')
    }
  }

  // ── P1-4：状态流动作（操作列下拉菜单，按状态显示可用动作，避免 5 按钮并排）──
  const statusMenuItems = (r: Contract): NonNullable<MenuProps['items']> => {
    const actions: { key: string; label: string; icon?: React.ReactNode; danger?: boolean }[] = []
    if (!canApprove) return actions
    if (r.approval_status === 'none' && r.status === 'draft') {
      actions.push({ key: 'submit', label: '提交审批', icon: <SendOutlined /> })
    } else if (r.approval_status === 'rejected') {
      actions.push({ key: 'submit', label: '重新提交审批', icon: <SendOutlined /> })
    } else if (r.approval_status === 'pending') {
      actions.push({ key: 'approval', label: '审批进度', icon: <HistoryOutlined /> })
    } else if (r.approval_status === 'approved' && r.status === 'draft') {
      actions.push({ key: 'start', label: '开始执行', icon: <PlayCircleOutlined /> })
    } else if (r.approval_status === 'approved' && r.status === 'active') {
      actions.push({ key: 'complete', label: '完成合同', icon: <CheckCircleOutlined /> })
      actions.push({ key: 'terminate', label: '终止合同', icon: <StopOutlined />, danger: true })
    }
    return actions
  }

  const onStatusAction = (r: Contract, key: string) => {
    switch (key) {
      case 'submit':
        handleApproval(r.id, 'submit')
        break
      case 'approval':
        openApprovalModal(r)
        break
      case 'start':
        handleLifecycle(r.id, 'active')
        break
      case 'complete':
        Modal.confirm({
          title: '确认完成该合同？',
          content: '完成后结算收入流水',
          okText: '完成',
          onOk: () => handleLifecycle(r.id, 'completed')
        })
        break
      case 'terminate':
        Modal.confirm({
          title: '确认终止该合同？',
          content: '终止后不可恢复',
          okText: '终止',
          okButtonProps: { danger: true },
          onOk: () => handleLifecycle(r.id, 'terminated')
        })
        break
    }
  }

  const openDetail = async (id: number) => {
    const [c, versionRows] = await Promise.all([
      invoke(IPC_CHANNELS.CONTRACT_GET, id) as Promise<ContractWithItems>,
      invoke(IPC_CHANNELS.CONTRACT_LIST_VERSIONS, id) as Promise<ContractVersion[]>
    ])
    setDetail(c)
    setVersions(Array.isArray(versionRows) ? versionRows : [])
    setDetailOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await invoke(IPC_CHANNELS.CONTRACT_DELETE, id)
      setContracts(prev => prev.filter(c => c.id !== id))
      message.success('删除成功')
    } catch {
      message.error('删除失败')
    }
  }

  // ── 批量操作：批量提交审批 / 批量批准 / 批量删除 ──
  const selectedContracts = contracts.filter(c => selectedRowKeys.includes(c.id))
  // 各操作的可选条件：submit 仅草稿/已驳回；approve 仅待审批；delete 任意
  const canBatchSubmit = selectedContracts.length > 0 && selectedContracts.every(c => c.approval_status === 'none' || c.approval_status === 'rejected')
  const canBatchApprove = selectedContracts.length > 0 && selectedContracts.every(c => c.approval_status === 'pending')
  const batchBarVisible = (canApprove || canEdit) && selectedRowKeys.length > 0

  const handleBatch = async (action: 'submit' | 'approve' | 'delete') => {
    if (selectedRowKeys.length === 0) return
    setBatchAction(action)
    try {
      const res = await invoke(
        IPC_CHANNELS.CONTRACT_BATCH_APPROVE,
        selectedRowKeys.map(Number),
        action,
        user?.username || '',
        user?.role || ''
      ) as any
      if (res && res.success === false) { message.error(res.message || '批量操作失败'); return }
      const results = Array.isArray(res?.results) ? res.results : []
      const okCount = results.filter((r: any) => r.success).length
      const failCount = results.length - okCount
      // 刷新列表：删除的移除，审批的更新状态
      if (action === 'delete') {
        const deletedIds = new Set(results.filter((r: any) => r.success).map((r: any) => r.id))
        setContracts(prev => prev.filter(c => !deletedIds.has(c.id)))
      } else {
        load()
      }
      setSelectedRowKeys([])
      if (failCount === 0) {
        message.success(`批量${action === 'submit' ? '提交审批' : action === 'approve' ? '批准' : '删除'}成功：${okCount} 条`)
      } else {
        message.warning(`批量操作完成：成功 ${okCount} 条，失败 ${failCount} 条` +
          (results.filter((r: any) => !r.success).map((r: any) => `#${r.id} ${r.message || ''}`).join('；')))
      }
    } catch (err: any) {
      message.error(err?.message || '批量操作失败')
    } finally {
      setBatchAction('')
    }
  }

  const handleSave = async () => {
    setSubmitting(true)
    try {
      const values = await form.validateFields()
      if (items.length === 0) { message.warning('请至少添加一个明细项'); setSubmitting(false); return }

      // 获取选中的公司名称
      const selectedCompany = companies.find(c => c.id === values.party_b_id)
      const partyBName = selectedCompany?.name || values.party_b_name || ''

      const saved = await invoke(IPC_CHANNELS.CONTRACT_CREATE, {
        ...values,
        contract_type_id: contractTypeId,
        party_b_name: partyBName,
        party_b_id: values.party_b_id ?? null,
        sign_date: values.sign_date?.format('YYYY-MM-DD') || null,
        items,
        created_by: user?.username || ''
      }) as Contract
      message.success('合同创建成功（草稿，请提交审批）')
      setContracts(prev => [saved, ...prev])
      // Reset for continuous entry
      setItems([])
      form.resetFields()
      form.setFieldsValue({ contract_type_id: contractTypeId, sign_date: values.sign_date })
    } catch (err: any) {
      if (err?.errorFields) return // 表单验证错误，Form 已展示
      message.error(err?.message || '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const addItem = () => {
    const base = { item_name: '', quantity: 1, unit_price: 0 }
    switch (contractTypeId) {
      case 1: // 基建
        setItems([...items, { ...base, land_area: 0 }])
        break
      case 2: // 劳动力
        setItems([...items, { ...base, skill_level: 0 }])
        break
      case 3: // 开采
        setItems([...items, { ...base, carbon_factor: 0 }])
        break
      case 4: case 5: // 销售/采购
        setItems([...items, { ...base, tax_rate: 0 }])
        break
      case 6: // 投资
        setItems([...items, { ...base, expected_income: 0, total_cost: 0 }])
        break
      case 7: // 拨款
        setItems([...items, { ...base, total_cost: 0 }])
        break
      case 8: // 减碳
        setItems([...items, { ...base, carbon_factor: 0 }])
        break
      default:
        setItems([...items, { ...base, land_area: 0 }])
    }
  }
  const updateItem = (idx: number, field: string, value: unknown) => {
    const newItems = [...items]
    newItems[idx] = { ...newItems[idx], [field]: value }
    setItems(newItems)
  }
  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx))
  }

  const contractTypeName = contractTypes.find(t => t.id === contractTypeId)?.name || ''

  // 渲染历史快照字段值（解析 ID 为名称，状态为中文标签）
  const renderSnapValue = (key: string, v: unknown): React.ReactNode => {
    if (v === null || v === undefined || v === '') return <span style={{ color: T.textMuted }}>-</span>
    switch (key) {
      case 'status':
        return <Tag color={statusColors[v as string]}>{statusLabels[v as string] || String(v)}</Tag>
      case 'contract_type_id':
      case 'contract_type_name':
        return <Tag>{contractTypes.find(t => t.id === Number(v))?.name || String(v)}</Tag>
      case 'region_id':
      case 'region_name':
        return regions.find(r => r.id === Number(v))?.name || String(v)
      case 'party_b_id':
      case 'company_name':
        return companies.find(c => c.id === Number(v))?.name || String(v)
      default:
        return String(v)
    }
  }

  // Card style for form sections - luminance stacking
  const itemCardStyle: React.CSSProperties = {
    background: T.bgCard,
    border: `1px solid ${T.border}`,
    borderRadius: 4,
  }
  const itemCardHeaderStyle = {
    background: T.bgCard,
    borderBottom: `1px solid ${T.border}`,
    minHeight: 32,
    padding: '6px 12px',
  }
  const itemCardBodyStyle = { padding: '10px 12px' }

  const columns = [
    { title: '合同编号', dataIndex: 'contract_no', width: 150 },
    { title: '名称', dataIndex: 'contract_name', ellipsis: true },
    { title: '类型', dataIndex: 'contract_type_name', width: 100,
      render: (v: string) => <Tag>{v}</Tag>
    },
    { title: '区域', dataIndex: 'region_name', width: 80 },
    { title: '签约公司', dataIndex: 'company_name', width: 120,
      render: (v: string) => v ? <span style={{ fontSize: 12 }}>{v}</span> : <span style={{ color: T.textMuted, fontSize: 11 }}>-</span>
    },
    {
      title: '状态', dataIndex: 'status', width: 190,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
        <div style={{ padding: 8, background: '#1A1F2E', border: '1px solid rgba(212,175,55,0.12)', borderRadius: 4 }}>
          <Checkbox.Group
            options={[
              { label: '草稿', value: 'draft' },
              { label: '待审批', value: 'pending' },
              { label: '已审批', value: 'approved' },
              { label: '执行中', value: 'active' },
              { label: '已完成', value: 'completed' },
              { label: '已终止', value: 'terminated' },
              { label: '已驳回', value: 'rejected' },
            ]}
            value={selectedKeys as string[]}
            onChange={(checkedValues) => setSelectedKeys(checkedValues)}
            style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
          />
          <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
            <Button size="small" type="link" onClick={() => { if (clearFilters) clearFilters() } }>重置</Button>
            <Button size="small" type="primary" onClick={() => confirm()}>确定</Button>
          </div>
        </div>
      ),
      filterIcon: (filtered: boolean) => <FilterOutlined style={{ color: filtered ? '#D4AF37' : undefined }} />,
      onFilter: (value: any, record: Contract) => contractState(record).key === value,
      render: (_: string, r: Contract) => {
        const st = contractState(r)
        return (
          <Tag color={st.color}>{st.label}</Tag>
        )
      }
    },
    { title: '签约日期', dataIndex: 'sign_date', width: 100, sorter: (a: Contract, b: Contract) => (a.sign_date || '').localeCompare(b.sign_date || '') },
    {
      title: '操作', width: 190,
      render: (_: unknown, r: Contract) => {
        const menuItems = statusMenuItems(r)
        return (
          <Space size={2}>
            {canEdit ? <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /> : null}
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.id)} />
            {canApprove && r.approval_status === 'pending' && (
              <>
                <Tooltip title="批准">
                  <Button size="small" type="link" icon={<CheckCircleOutlined style={{ color: T.green }} />} onClick={() => handleApproval(r.id, 'approve')} />
                </Tooltip>
                <Tooltip title="驳回">
                  <Button size="small" type="link" danger icon={<StopOutlined />} onClick={() => handleApproval(r.id, 'reject')} />
                </Tooltip>
              </>
            )}
            {menuItems && menuItems.length > 0 && (
              <Dropdown
                menu={{ items: menuItems, onClick: ({ key }) => onStatusAction(r, key as string) }}
                trigger={['click']}
                placement="bottomRight"
              >
                <Button size="small" type="link" icon={<MoreOutlined />} title="更多操作" />
              </Dropdown>
            )}
            {canEdit && (
              <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
                <Button type="link" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </Space>
        )
      }
    }
  ]

  const renderItemFields = () => {
    // 字段定义：每个类型对应的列（label / 宽度 / 绑定字段 / 控件类型）
    type FieldDef = { label: string; span: number; field: string; type: 'text' | 'num' | 'select'; placeholder: string; step?: number }
    const FIELD_SETS: Record<number, { title: string; hint: string; fields: FieldDef[] }> = {
      1: { title: '基建项目', hint: '基础设施建设合同 - 填写项目名、数量、单价与占地面积',
        fields: [
          { label: '项目名称', span: 7, field: 'item_name', type: 'text', placeholder: '如：道路硬化工程' },
          { label: '数量', span: 4, field: 'quantity', type: 'num', placeholder: '如：3' },
          { label: '单价(元)', span: 5, field: 'unit_price', type: 'num', placeholder: '如：500000' },
          { label: '占地面积(㎡)', span: 5, field: 'land_area', type: 'num', placeholder: '如：1200' },
        ] },
      2: { title: '招聘岗位', hint: '劳动力合同 - 招聘岗位、人数、月薪与技能等级',
        fields: [
          { label: '岗位名称', span: 6, field: 'item_name', type: 'text', placeholder: '如：技术工人' },
          { label: '人数', span: 4, field: 'quantity', type: 'num', placeholder: '如：10' },
          { label: '月薪(元)', span: 4, field: 'unit_price', type: 'num', placeholder: '如：8000' },
          { label: '技能等级', span: 4, field: 'skill_level', type: 'select', placeholder: '选择等级' },
        ] },
      3: { title: '开采项', hint: '原料开采合同 - 原料名称、数量、单价与碳排放系数',
        fields: [
          { label: '原料名称', span: 6, field: 'item_name', type: 'text', placeholder: '如：铁矿石' },
          { label: '数量(吨)', span: 4, field: 'quantity', type: 'num', placeholder: '如：100' },
          { label: '单价(元)', span: 4, field: 'unit_price', type: 'num', placeholder: '如：500' },
          { label: '碳排放系数', span: 4, field: 'carbon_factor', type: 'num', placeholder: '如：0.8', step: 0.1 },
        ] },
      4: { title: '销售产品', hint: '销售合同 - 产品名称、数量、单价与税率',
        fields: [
          { label: '产品名称', span: 6, field: 'item_name', type: 'text', placeholder: '如：钢材' },
          { label: '数量', span: 4, field: 'quantity', type: 'num', placeholder: '如：50' },
          { label: '单价(元)', span: 4, field: 'unit_price', type: 'num', placeholder: '如：3000' },
          { label: '税率(%)', span: 4, field: 'tax_rate', type: 'num', placeholder: '如：13' },
        ] },
      5: { title: '采购物资', hint: '采购合同 - 物资名称、数量、单价与税率',
        fields: [
          { label: '物资名称', span: 6, field: 'item_name', type: 'text', placeholder: '如：水泥' },
          { label: '数量', span: 4, field: 'quantity', type: 'num', placeholder: '如：200' },
          { label: '单价(元)', span: 4, field: 'unit_price', type: 'num', placeholder: '如：450' },
          { label: '税率(%)', span: 4, field: 'tax_rate', type: 'num', placeholder: '如：13' },
        ] },
      6: { title: '投资项目', hint: '投资合同 - 项目名称、投资总额、预期收益与数量',
        fields: [
          { label: '项目名称', span: 6, field: 'item_name', type: 'text', placeholder: '如：产业园二期' },
          { label: '投资总额(元)', span: 5, field: 'total_cost', type: 'num', placeholder: '如：10000000' },
          { label: '预期收益(元)', span: 5, field: 'expected_income', type: 'num', placeholder: '如：15000000' },
          { label: '数量', span: 5, field: 'quantity', type: 'num', placeholder: '如：1' },
        ] },
      7: { title: '拨款项目', hint: '拨款合同 - 项目名称、拨款金额、数量与单价',
        fields: [
          { label: '项目名称', span: 6, field: 'item_name', type: 'text', placeholder: '如：农田补贴' },
          { label: '拨款金额(元)', span: 5, field: 'total_cost', type: 'num', placeholder: '如：500000' },
          { label: '数量', span: 5, field: 'quantity', type: 'num', placeholder: '如：1' },
          { label: '单价(元)', span: 5, field: 'unit_price', type: 'num', placeholder: '如：500000' },
        ] },
      8: { title: '减碳项目', hint: '减碳合同 - 项目名称、减排量、碳排系数与单价',
        fields: [
          { label: '项目名称', span: 6, field: 'item_name', type: 'text', placeholder: '如：光伏发电' },
          { label: '减排量(吨)', span: 5, field: 'quantity', type: 'num', placeholder: '如：500' },
          { label: '碳排系数', span: 5, field: 'carbon_factor', type: 'num', placeholder: '如：0.5', step: 0.1 },
          { label: '单价(元)', span: 5, field: 'unit_price', type: 'num', placeholder: '如：100' },
        ] },
    }
    const config = FIELD_SETS[contractTypeId || 1]
    const addLabel = config.title.replace('项', '').replace('岗位', '')

    return (
      <Card title={config.title} size="small"
        extra={<Button size="small" onClick={addItem}>+ 添加{addLabel}</Button>}
        style={itemCardStyle} styles={{ header: itemCardHeaderStyle, body: itemCardBodyStyle }}>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
          {config.hint}
        </Typography.Text>
        {items.length === 0 && (
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>
            点击上方按钮添加{config.title} · {config.fields.map(f => f.label).join(' / ')}
          </Typography.Text>
        )}
        {items.map((item, idx) => (
          <div key={idx} style={{ border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 10px', marginBottom: 8, background: T.bgPanel }}>
            <Row gutter={8} align="bottom">
              {config.fields.map(f => (
                <Col span={f.span} key={f.field}>
                  <div style={{ fontSize: 11, color: T.textSecondary, marginBottom: 2 }}>{f.label}</div>
                  {f.type === 'select' ? (
                    <Select placeholder={f.placeholder} style={{ width: '100%' }}
                      value={(item as any)[f.field]}
                      onChange={v => updateItem(idx, f.field, v)}
                      options={[
                        { value: 0, label: '普通工人' },
                        { value: 1, label: '高素质人才' }
                      ]} />
                  ) : f.type === 'text' ? (
                    <Input placeholder={f.placeholder} value={(item as any)[f.field] || ''}
                      onChange={e => updateItem(idx, f.field, e.target.value)} />
                  ) : (
                    <InputNumber placeholder={f.placeholder} style={{ width: '100%' }} min={0}
                      step={f.step} value={(item as any)[f.field]}
                      onChange={v => updateItem(idx, f.field, v)} />
                  )}
                </Col>
              ))}
              <Col span={2}>
                <Popconfirm title="确认删除此项？" onConfirm={() => removeItem(idx)}>
                  <Button danger size="small" style={{ marginBottom: 0 }}>删除</Button>
                </Popconfirm>
              </Col>
            </Row>
          </div>
        ))}
      </Card>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>{canEdit ? '合同管理' : '合同总览'}</div>
          {!canEdit && (
            <Tag color="gold" style={{ margin: 0, fontSize: 11, lineHeight: '18px' }}>
              只读
            </Tag>
          )}
        </div>
        {canCreate && <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>新建合同</Button>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input prefix={<SearchOutlined />} placeholder="搜索编号/名称" size="small" style={{ width: 180 }}
            allowClear value={searchText} onChange={e => setSearchText(e.target.value)} />
          <Select placeholder="合同类型" size="small" style={{ width: 130 }} allowClear
            value={filterType} onChange={setFilterType}
            options={contractTypes.map(t => ({ value: t.id, label: t.name }))} />
          <Select placeholder="区域" size="small" style={{ width: 100 }} allowClear
            value={filterRegion} onChange={setFilterRegion}
            options={regions.map(r => ({ value: r.id, label: r.name }))} />
          <Segmented
            size="small"
            value={quickFilter}
            onChange={(v) => setQuickFilter(v as string)}
            options={[
              { value: 'all', label: '全部' },
              { value: 'todo', label: '我的待办' },
              { value: 'pending', label: '待审批' },
              { value: 'active', label: '执行中' },
              { value: 'expired', label: '已过期' },
              { value: 'rejected', label: '已驳回' },
            ]}
          />
          <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 'auto', lineHeight: '24px' }}>
            {filteredContracts.length} 条 / {contracts.length} 总计{canEdit ? '  ·  Ctrl+N 新建' : ' （只读模式）'}
          </span>
        </div>
        {batchBarVisible && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
            padding: '8px 12px', background: T.bgCard,
            border: `1px solid ${T.border}`, borderRadius: 4, flexWrap: 'wrap'
          }}>
            <span style={{ fontSize: 12, color: T.textSecondary }}>
              已选 <span style={{ color: T.primary, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>{selectedRowKeys.length}</span> 项
            </span>
            <Divider type="vertical" />
            {canApprove && (
              <>
                <Button
                  size="small"
                  icon={<SendOutlined />}
                  disabled={!canBatchSubmit || batchBusy}
                  loading={batchAction === 'submit'}
                  onClick={() => handleBatch('submit')}
                >
                  批量提交审批
                </Button>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<CheckCircleOutlined />}
                  disabled={!canBatchApprove || batchBusy}
                  loading={batchAction === 'approve'}
                  onClick={() => handleBatch('approve')}
                >
                  批量批准
                </Button>
              </>
            )}
            {canEdit && (
              <Popconfirm
                title={`确认删除选中的 ${selectedRowKeys.length} 个合同？`}
                description="删除后不可恢复"
                onConfirm={() => handleBatch('delete')}
                okText="删除"
                okButtonProps={{ danger: true }}
                disabled={batchBusy}
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={batchBusy}
                  loading={batchAction === 'delete'}
                >
                  批量删除
                </Button>
              </Popconfirm>
            )}
            <span style={{ flex: 1 }} />
            <Button
              size="small"
              type="link"
              style={{ fontSize: 12, color: T.textSecondary }}
              disabled={batchBusy}
              onClick={() => setSelectedRowKeys([])}
            >
              清空选择
            </Button>
          </div>
        )}
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4 }}>
          <Table
          dataSource={filteredContracts}
          rowKey="id"
          columns={columns}
          loading={loading}
          pagination={{ pageSize: 20 }}
          size="small"
          className="dense-table"
          showSorterTooltip={{ title: '点击排序' }}
          rowSelection={canApprove || canEdit ? {
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
            getCheckboxProps: () => ({ disabled: batchBusy })
          } : undefined}
          locale={{ emptyText:
              <div style={{ padding: '24px 0' }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <div>
                      <span style={{ color: T.textPrimary, fontSize: 14, fontWeight: 500 }}>
                        暂无合同
                      </span>
                      <br />
                      <span style={{ color: T.textMuted, fontSize: 12 }}>
                        创建您的第一份合同
                      </span>
                    </div>
                  }
                >
                  {canCreate && <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
                    创建合同
                  </Button>}
                </Empty>
              </div>
            }}
          />
        </div>

      <Modal
        title="新建合同"
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        onOk={handleSave}
        width={720}
        okText="保存合同"
        confirmLoading={submitting}
        destroyOnClose
        afterOpenChange={(open) => { if (open) setTimeout(() => nameInputRef.current?.focus(), 60) }}
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="contract_name" label="合同名称" rules={[{ required: true }]}>
                <Input ref={nameInputRef} placeholder="输入合同名称后回车保存" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="合同类型" rules={[{ required: true }]}>
                <Select
                  placeholder="选择类型"
                  value={contractTypeId}
                  onChange={(v) => { setContractTypeId(v); setItems([]) }}
                  options={contractTypes.map(t => ({ value: t.id, label: t.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="party_b_id" label="签约公司">
                <Select
                  showSearch
                  placeholder="搜索选择公司"
                  options={companies.map(c => ({ value: c.id, label: c.name }))}
                  allowClear
                  filterOption={(input, option) =>
                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="region_id" label="所属区域" rules={[{ required: true, message: '请选择区域' }]}>
                <Select
                  placeholder="选择区域"
                  options={regions.map(r => ({ value: r.id, label: r.name }))}
                  showSearch
                  filterOption={(input, option) =>
                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={5}>
              <Form.Item name="sign_date" label="签约日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="party_a" label="甲方">
                <Input placeholder="我方公司名" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="notes" label="备注">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        {contractTypeId && (
          <>
            <Divider />
            {renderItemFields()}
          </>
        )}
        {!contractTypeId && (
          <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: 24 }}>
            请先选择合同类型
          </Typography.Text>
        )}
        <Divider style={{ margin: '8px 0' }} />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          新建合同默认为「草稿」，需提交审批通过后方可执行并计入资金流水。
        </Typography.Text>
      </Modal>

      <Modal title="编辑合同" open={editOpen} onCancel={() => setEditOpen(false)} onOk={handleEditSave} width={560} confirmLoading={editSubmitting} destroyOnClose>
        {editingContract && (
          <Form layout="vertical" size="small">
            <Form.Item label="合同名称">
              <Input value={editingContract.contract_name}
                onChange={(e) => setEditingContract({ ...editingContract, contract_name: e.target.value })} />
            </Form.Item>
            <Form.Item label="审批状态">
              <Tag color={contractState(editingContract).color}>{contractState(editingContract).label}</Tag>
              <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 8 }}>
                状态由审批流程控制，请在列表中操作
              </span>
            </Form.Item>
            <Form.Item label="备注">
              <Input.TextArea rows={2} value={editingContract.notes || ''}
                onChange={(e) => setEditingContract({ ...editingContract, notes: e.target.value })} />
            </Form.Item>
            <Form.Item label="明细项">
              {editItems.length === 0 ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>该合同暂无明细项</Typography.Text>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {editItems.map((it, idx) => (
                    <div key={it.id ?? idx} style={{ border: `1px solid ${T.border}`, borderRadius: 4, padding: '6px 8px', background: T.bgPanel }}>
                      <div style={{ fontSize: 11, color: T.textSecondary, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {it.item_name || '未命名明细'}
                      </div>
                      <Space size={8} wrap>
                        <span style={{ fontSize: 11, color: T.textMuted }}>数量</span>
                        <InputNumber size="small" min={0} style={{ width: 84 }} value={it.quantity}
                          onChange={(v) => updateEditItem(idx, 'quantity', v)} />
                        <span style={{ fontSize: 11, color: T.textMuted }}>单价</span>
                        <InputNumber size="small" min={0} style={{ width: 110 }} value={it.unit_price}
                          onChange={(v) => updateEditItem(idx, 'unit_price', v)} />
                        <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 'auto' }}>
                          小计 {formatMoneyCNY((it.quantity ?? 0) * (it.unit_price ?? 0))}
                        </span>
                      </Space>
                    </div>
                  ))}
                </div>
              )}
            </Form.Item>
          </Form>
        )}
      </Modal>

      <Modal
        title="审批合同"
        open={approvalOpen}
        onCancel={() => setApprovalOpen(false)}
        width={460}
        footer={null}
        destroyOnClose
      >
        {approvalContract && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary }}>
                {approvalContract.contract_name}
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{approvalContract.contract_no}</div>
            </div>
            <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 16 }}>
              审批人：{user?.username || '-'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Popconfirm
                title="确认驳回该合同？驳回后需重新提交审批"
                onConfirm={() => doApprove('reject')}
              >
                <Button danger icon={<StopOutlined />} loading={approvalSubmitting}>驳回</Button>
              </Popconfirm>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={approvalSubmitting}
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
                onClick={() => doApprove('approve')}
              >
                批准
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Modal title="合同详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={760} destroyOnClose>
        {detail && (
          <Tabs
            size="small"
            items={[
              {
                key: 'info',
                label: '基本信息',
                children: (
                  <>
                    <table className="gipfel-detail-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        <tr><td style={{ padding: 6, fontWeight: 500, width: 100 }}>编号</td><td>{detail.contract_no}</td></tr>
                        <tr><td style={{ padding: 6, fontWeight: 500 }}>名称</td><td>{detail.contract_name}</td></tr>
                        <tr><td style={{ padding: 6, fontWeight: 500 }}>类型</td><td><Tag>{detail.contract_type_name}</Tag></td></tr>
                        <tr><td style={{ padding: 6, fontWeight: 500 }}>区域</td><td>{detail.region_name || '-'}</td></tr>
                        <tr><td style={{ padding: 6, fontWeight: 500 }}>对方公司</td><td>{detail.company_name || detail.party_b_name || '-'}</td></tr>
                        <tr><td style={{ padding: 6, fontWeight: 500 }}>状态</td><td><Tag color={statusColors[detail.status]}>{statusLabels[detail.status]}</Tag></td></tr>
                        <tr><td style={{ padding: 6, fontWeight: 500 }}>审批状态</td><td>
                          <Tag color={contractState(detail).color}>{contractState(detail).label}</Tag>
                          <span style={{ fontSize: 11, color: T.textMuted }}>
                            （{approvalLabels[detail.approval_status] || detail.approval_status}）
                            {detail.approved_at ? ` · ${detail.approved_by || '-'} · ${detail.approved_at}` : ''}
                          </span>
                        </td></tr>
                        <tr><td style={{ padding: 6, fontWeight: 500 }}>签约日期</td><td>{detail.sign_date || '-'}</td></tr>
                        <tr><td style={{ padding: 6, fontWeight: 500 }}>操作人</td><td>创建：{detail.created_by || '-'}　更新：{detail.updated_by || '-'}</td></tr>
                      </tbody>
                    </table>
                    {detail.items && detail.items.length > 0 && (
                      <>
                        <Divider />
                        <Typography.Text strong>明细项</Typography.Text>
                        <Table className="gipfel-detail-table" dataSource={detail.items} rowKey="id" size="small" pagination={false}
                          columns={[
                            { title: '项目名称', dataIndex: 'item_name', ellipsis: true },
                            { title: '数量', dataIndex: 'quantity', width: 80, render: (v: any) => (typeof v === 'number' ? formatNumber(v) : v ?? '-') },
                            { title: '单价', dataIndex: 'unit_price', width: 110, render: (v: any) => (typeof v === 'number' ? formatMoneyCNY(v) : v ?? '-') },
                            { title: '小计', dataIndex: 'amount', width: 120, render: (v: any, r: any) => formatMoneyCNY(v ?? (r.quantity ?? 0) * (r.unit_price ?? 0)) },
                            { title: '占地面积', dataIndex: 'land_area', width: 90, render: (v: any) => (v ? formatNumber(v) : '-') },
                            { title: '技能等级', dataIndex: 'skill_level', width: 90, render: (v: any) => (v ? formatNumber(v) : '-') },
                            { title: '碳排系数', dataIndex: 'carbon_factor', width: 90, render: (v: any) => (v ? formatNumber(v) : '-') }
                          ]}
                        />
                      </>
                    )}
                  </>
                )
              },
              {
                key: 'versions',
                label: <span><HistoryOutlined /> 版本历史（{versions.length}）</span>,
                children: (
                  <Table
                    className="gipfel-detail-table"
                    dataSource={versions}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无版本记录" /> }}
                    columns={[
                      { title: '版本', dataIndex: 'version', width: 70,
                        render: (v: number) => <Tag color="gold">v{v}</Tag>
                      },
                      { title: '更新时间', dataIndex: 'created_at', width: 165 },
                      { title: '操作人', dataIndex: 'created_by', width: 110,
                        render: (v: string) => v || '-'
                      },
                      { title: '变更内容', dataIndex: 'changed_fields',
                        render: (fields: string[], r: ContractVersion) => {
                          if (r.version === 1 && (!fields || fields.length === 0)) {
                            return <Tag>创建合同</Tag>
                          }
                          if (!fields || fields.length === 0) return <span style={{ color: T.textMuted }}>-</span>
                          return fields.map(f => <Tag key={f} style={{ marginRight: 4 }}>{FIELD_LABELS[f] || f}</Tag>)
                        }
                      },
                      { title: '操作', width: 80,
                        render: (_: unknown, r: ContractVersion) => (
                          <Button type="link" size="small" onClick={() => setVersionDetail(r)}>查看</Button>
                        )
                      }
                    ]}
                  />
                )
              }
            ]}
          />
        )}
      </Modal>

      <Modal
        title={versionDetail ? `版本详情 v${versionDetail.version}` : '版本详情'}
        open={!!versionDetail}
        onCancel={() => setVersionDetail(null)}
        footer={null}
        width={720}
        destroyOnClose
      >
        {versionDetail && (
          <>
            <table className="gipfel-detail-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td style={{ padding: 6, fontWeight: 500, width: 100 }}>版本</td><td><Tag color="gold">v{versionDetail.version}</Tag></td></tr>
                <tr><td style={{ padding: 6, fontWeight: 500 }}>保存时间</td><td>{versionDetail.created_at || '-'}</td></tr>
                <tr><td style={{ padding: 6, fontWeight: 500 }}>操作人</td><td>{versionDetail.created_by || '-'}</td></tr>
                <tr><td style={{ padding: 6, fontWeight: 500 }}>变更内容</td><td>
                  {versionDetail.version === 1 && versionDetail.changed_fields.length === 0
                    ? <Tag>创建合同</Tag>
                    : versionDetail.changed_fields.length > 0
                      ? versionDetail.changed_fields.map(f => <Tag key={f} style={{ marginRight: 4 }}>{FIELD_LABELS[f] || f}</Tag>)
                      : <span style={{ color: T.textMuted }}>-</span>}
                </td></tr>
              </tbody>
            </table>
            <Divider />
            <Typography.Text strong>历史快照字段</Typography.Text>
            <table className="gipfel-detail-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
              <tbody>
                {SNAPSHOT_FIELDS.map(([key, label]) => (
                  <tr key={key}>
                    <td style={{ padding: 6, fontWeight: 500, width: 100 }}>{label}</td>
                    <td>{renderSnapValue(key, versionDetail.snapshot[key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Array.isArray(versionDetail.snapshot.items) && versionDetail.snapshot.items.length > 0 && (
              <>
                <Divider />
                <Typography.Text strong>明细项快照</Typography.Text>
                <Table className="gipfel-detail-table" dataSource={versionDetail.snapshot.items as any[]} rowKey={(_, idx) => String(idx)} size="small" pagination={false}
                  columns={[
                    { title: '项目名称', dataIndex: 'item_name' },
                    { title: '数量', dataIndex: 'quantity', width: 80, render: (v: any) => (typeof v === 'number' ? v.toFixed(2) : v ?? '-') },
                    { title: '单价', dataIndex: 'unit_price', width: 90, render: (v: any) => (typeof v === 'number' ? v.toFixed(2) : v ?? '-') },
                    { title: '占地面积', dataIndex: 'land_area', width: 90, render: (v: any) => (typeof v === 'number' ? v.toFixed(2) : v ?? '-') },
                    { title: '技能等级', dataIndex: 'skill_level', width: 90, render: (v: any) => (typeof v === 'number' ? v.toFixed(2) : v ?? '-') },
                    { title: '碳排系数', dataIndex: 'carbon_factor', width: 90, render: (v: any) => (typeof v === 'number' ? v.toFixed(2) : v ?? '-') }
                  ]}
                />
              </>
            )}
          </>
        )}
      </Modal>

      {/* 详情弹窗表格密度：12px 字号 + 紧凑行高 */}
      <style>{`
        .gipfel-detail-table td { font-size: 12px; padding: 4px 6px !important; }
        .gipfel-detail-table th { font-size: 12px; padding: 5px 8px !important; }
        .gipfel-detail-table .ant-table { font-size: 12px; }
        .gipfel-detail-table .ant-table-thead > tr > th { font-size: 12px; padding: 5px 8px !important; }
        .gipfel-detail-table .ant-table-tbody > tr > td { font-size: 12px; padding: 4px 8px !important; }
      `}</style>
    </div>
  )
}

export default ContractListPage
