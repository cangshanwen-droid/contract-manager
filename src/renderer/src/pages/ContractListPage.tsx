import React, { useEffect, useState } from 'react'
import {
  Table, Button, Modal, Form, Input, Select, DatePicker, Space, Popconfirm,
  Typography, message, Spin, Tag, InputNumber, Card, Row, Col, Divider
} from 'antd'
import { PlusOutlined, DeleteOutlined, EyeOutlined, CalculatorOutlined } from '@ant-design/icons'
import { api } from '../api/dashboard.api'
import type { Contract, ContractWithItems, Company, Region, ContractType } from '../../../shared/types'
import dayjs from 'dayjs'

const statusColors: Record<string, string> = {
  draft: 'default', active: 'processing', completed: 'success',
  terminated: 'error', expired: 'warning'
}
const statusLabels: Record<string, string> = {
  draft: '草稿', active: '进行中', completed: '已完成',
  terminated: '终止', expired: '过期'
}

const ContractListPage: React.FC = () => {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractTypes, setContractTypes] = useState<ContractType[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<ContractWithItems | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [contractTypeId, setContractTypeId] = useState<number | null>(null)
  const [items, setItems] = useState<Partial<any>[]>([])
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const [ctList, comps, regs, contractsList] = await Promise.all([
        api.contractType.list(),
        api.company.list(),
        api.region.list(),
        window.api.invoke('contract:list') as Promise<Contract[]>
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

  const openCreate = () => {
    setContractTypeId(null)
    setItems([])
    form.resetFields()
    setFormOpen(true)
  }

  const openDetail = async (id: number) => {
    const c = await (window.api.invoke('contract:get', id) as Promise<ContractWithItems>)
    setDetail(c)
    setDetailOpen(true)
  }

  const handleDelete = async (id: number) => {
    await window.api.invoke('contract:delete', id)
    message.success('删除成功')
    load()
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    if (items.length === 0) {
      message.warning('请至少添加一个明细项')
      return
    }
    await window.api.invoke('contract:create', {
      ...values,
      contract_type_id: contractTypeId,
      sign_date: values.sign_date?.format('YYYY-MM-DD') || null,
      items
    })
    message.success('合同创建成功')
    setFormOpen(false)
    load()
  }

  const addItem = () => {
    setItems([...items, { item_name: '', quantity: 1, unit_price: 0, land_area: 0, tax_rate: 0, skill_level: 0, carbon_factor: 0 }])
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

  const columns = [
    { title: '合同编号', dataIndex: 'contract_no', width: 150 },
    { title: '名称', dataIndex: 'contract_name', ellipsis: true },
    { title: '类型', dataIndex: 'contract_type_name', width: 100,
      render: (v: string) => <Tag>{v}</Tag>
    },
    { title: '区域', dataIndex: 'region_name', width: 80 },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag>
    },
    { title: '签约日期', dataIndex: 'sign_date', width: 100 },
    {
      title: '操作', width: 120,
      render: (_: unknown, r: Contract) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.id)} />
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  const renderItemFields = () => {
    switch (contractTypeId) {
      case 2: // 劳动力合同
        return (
          <Card title="招聘岗位" size="small" extra={<Button size="small" onClick={addItem}>+ 添加岗位</Button>}>
            {items.map((item, idx) => (
              <Row key={idx} gutter={8} style={{ marginBottom: 8 }} align="middle">
                <Col span={6}>
                  <Input placeholder="岗位名称" value={item.item_name} onChange={e => updateItem(idx, 'item_name', e.target.value)} />
                </Col>
                <Col span={4}>
                  <InputNumber placeholder="人数" style={{ width: '100%' }} min={0}
                    value={item.quantity} onChange={v => updateItem(idx, 'quantity', v)} />
                </Col>
                <Col span={4}>
                  <InputNumber placeholder="月薪" style={{ width: '100%' }} min={0}
                    value={item.unit_price} onChange={v => updateItem(idx, 'unit_price', v)} />
                </Col>
                <Col span={4}>
                  <Select placeholder="技能等级" style={{ width: '100%' }}
                    value={item.skill_level}
                    onChange={v => updateItem(idx, 'skill_level', v)}
                    options={[
                      { value: 0, label: '普通工人' },
                      { value: 1, label: '高素质人才' }
                    ]}
                  />
                </Col>
                <Col span={2}>
                  <Button danger size="small" onClick={() => removeItem(idx)}>删</Button>
                </Col>
              </Row>
            ))}
            {items.length === 0 && <Typography.Text type="secondary">点击上方按钮添加招聘岗位</Typography.Text>}
          </Card>
        )

      case 3: // 原料开采合同
        return (
          <Card title="开采项" size="small" extra={<Button size="small" onClick={addItem}>+ 添加原料</Button>}>
            {items.map((item, idx) => (
              <Row key={idx} gutter={8} style={{ marginBottom: 8 }} align="middle">
                <Col span={6}>
                  <Input placeholder="原料名称" value={item.item_name} onChange={e => updateItem(idx, 'item_name', e.target.value)} />
                </Col>
                <Col span={4}>
                  <InputNumber placeholder="数量(吨)" style={{ width: '100%' }} min={0}
                    value={item.quantity} onChange={v => updateItem(idx, 'quantity', v)} />
                </Col>
                <Col span={4}>
                  <InputNumber placeholder="单价" style={{ width: '100%' }} min={0}
                    value={item.unit_price} onChange={v => updateItem(idx, 'unit_price', v)} />
                </Col>
                <Col span={4}>
                  <InputNumber placeholder="碳排放系数" style={{ width: '100%' }} min={0} step={0.1}
                    value={item.carbon_factor} onChange={v => updateItem(idx, 'carbon_factor', v)} />
                </Col>
                <Col span={2}>
                  <Button danger size="small" onClick={() => removeItem(idx)}>删</Button>
                </Col>
              </Row>
            ))}
            {items.length === 0 && <Typography.Text type="secondary">点击上方按钮添加原料开采项</Typography.Text>}
          </Card>
        )

      case 4: // 销售合同
      case 5: // 采购合同
        return (
          <Card title={contractTypeId === 4 ? '销售产品' : '采购物资'} size="small"
            extra={<Button size="small" onClick={addItem}>+ 添加</Button>}>
            {items.map((item, idx) => (
              <Row key={idx} gutter={8} style={{ marginBottom: 8 }} align="middle">
                <Col span={6}>
                  <Input placeholder="名称" value={item.item_name} onChange={e => updateItem(idx, 'item_name', e.target.value)} />
                </Col>
                <Col span={4}>
                  <InputNumber placeholder="数量" style={{ width: '100%' }} min={0}
                    value={item.quantity} onChange={v => updateItem(idx, 'quantity', v)} />
                </Col>
                <Col span={4}>
                  <InputNumber placeholder="单价" style={{ width: '100%' }} min={0}
                    value={item.unit_price} onChange={v => updateItem(idx, 'unit_price', v)} />
                </Col>
                <Col span={2}>
                  <Button danger size="small" onClick={() => removeItem(idx)}>删</Button>
                </Col>
              </Row>
            ))}
            {items.length === 0 && <Typography.Text type="secondary">点击上方按钮添加</Typography.Text>}
          </Card>
        )

      default: // 基建合同(1)和其他
        return (
          <Card title="基建项目" size="small" extra={<Button size="small" onClick={addItem}>+ 添加项目</Button>}>
            {items.map((item, idx) => (
              <Row key={idx} gutter={8} style={{ marginBottom: 8 }} align="middle">
                <Col span={4}>
                  <Input placeholder="项目名称" value={item.item_name} onChange={e => updateItem(idx, 'item_name', e.target.value)} />
                </Col>
                <Col span={3}>
                  <InputNumber placeholder="数量" style={{ width: '100%' }} min={0}
                    value={item.quantity} onChange={v => updateItem(idx, 'quantity', v)} />
                </Col>
                <Col span={3}>
                  <InputNumber placeholder="单价" style={{ width: '100%' }} min={0}
                    value={item.unit_price} onChange={v => updateItem(idx, 'unit_price', v)} />
                </Col>
                <Col span={4}>
                  <InputNumber placeholder="占地面积(㎡)" style={{ width: '100%' }} min={0}
                    value={item.land_area} onChange={v => updateItem(idx, 'land_area', v)} />
                </Col>
                <Col span={2}>
                  <Button danger size="small" onClick={() => removeItem(idx)}>删</Button>
                </Col>
              </Row>
            ))}
            {items.length === 0 && <Typography.Text type="secondary">点击上方按钮添加基建项目</Typography.Text>}
          </Card>
        )
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>合同管理</Typography.Title>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建合同
          </Button>
        </Space>
      </div>
      <Spin spinning={loading}>
        <Table
          dataSource={contracts}
          rowKey="id"
          columns={columns}
          pagination={{ pageSize: 20 }}
          size="small"
          locale={{ emptyText: '暂无合同，点击右上角新建' }}
        />
      </Spin>

      <Modal
        title="新建合同"
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        onOk={handleSave}
        width={720}
        okText="保存合同"
      >
        <Form form={form} layout="vertical" size="small">
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="contract_name" label="合同名称" rules={[{ required: true }]}>
                <Input />
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
              <Form.Item name="party_b_name" label="对方公司">
                <Select
                  showSearch
                  placeholder="搜索选择"
                  options={companies.map(c => ({ value: c.name, label: c.name }))}
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="region_id" label="所属区域">
                <Select
                  options={regions.map(r => ({ value: r.id, label: r.name }))}
                  allowClear
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item name="sign_date" label="签约日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="party_a" label="甲方">
                <Input placeholder="我方公司名" />
              </Form.Item>
            </Col>
            <Col span={12}>
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
      </Modal>

      <Modal title="合同详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={640}>
        {detail && (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td style={{ padding: 6, fontWeight: 500, width: 100 }}>编号</td><td>{detail.contract_no}</td></tr>
                <tr><td style={{ padding: 6, fontWeight: 500 }}>名称</td><td>{detail.contract_name}</td></tr>
                <tr><td style={{ padding: 6, fontWeight: 500 }}>类型</td><td><Tag>{detail.contract_type_name}</Tag></td></tr>
                <tr><td style={{ padding: 6, fontWeight: 500 }}>区域</td><td>{detail.region_name || '-'}</td></tr>
                <tr><td style={{ padding: 6, fontWeight: 500 }}>乙方</td><td>{detail.party_b_name || '-'}</td></tr>
                <tr><td style={{ padding: 6, fontWeight: 500 }}>状态</td><td><Tag color={statusColors[detail.status]}>{statusLabels[detail.status]}</Tag></td></tr>
                <tr><td style={{ padding: 6, fontWeight: 500 }}>签约日期</td><td>{detail.sign_date || '-'}</td></tr>
              </tbody>
            </table>
            {detail.items && detail.items.length > 0 && (
              <>
                <Divider />
                <Typography.Text strong>明细项</Typography.Text>
                <Table dataSource={detail.items} rowKey="id" size="small" pagination={false}
                  columns={Object.keys(detail.items[0] || {}).filter(k => ['item_name', 'quantity', 'unit_price', 'amount', 'land_area', 'skill_level', 'carbon_factor'].includes(k)).map(k => ({ title: k, dataIndex: k, render: (v: any) => typeof v === 'number' ? v.toFixed(2) : v }))}
                />
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}

export default ContractListPage
