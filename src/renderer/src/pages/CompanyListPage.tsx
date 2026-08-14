import React, { useEffect, useState } from 'react'
import { Input, Select, Button, Modal, Form, Popconfirm, message, Skeleton, Empty, Row, Col, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, StockOutlined } from '@ant-design/icons'
import { companyApi } from '../api/company.api'
import { regionApi } from '../api/region.api'
import { tokens as T } from '../styles/design-tokens'
import type { Company, Region } from '../../../shared/types'

const TYPE_OPTIONS = ['施工方', '设计方', '供应商', '投资方', '其他']

const CompanyListPage: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>()
  const [regionFilter, setRegionFilter] = useState<number>()
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const [comps, regs] = await Promise.all([
        companyApi.list(),
        regionApi.list(),
      ])
      setCompanies(comps)
      setRegions(regs)
    }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // ── 快捷键：Escape 关闭弹窗 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalOpen) { setModalOpen(false); e.preventDefault() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modalOpen])

  const filtered = companies.filter(c => {
    if (search && !c.name?.toLowerCase().includes(search.toLowerCase()) &&
        !c.contact?.toLowerCase().includes(search.toLowerCase())) return false
    if (typeFilter && c.company_type !== typeFilter) return false
    if (regionFilter !== undefined && c.region_id !== regionFilter) return false
    return true
  })

  const openCreate = () => { 
    setEditing(null)
    form.resetFields()
    setModalOpen(true) 
  }
  const openEdit = (c: Company) => { 
    setEditing(c)
    form.setFieldsValue({
      ...c,
      region_id: c.region_id,
    })
    setModalOpen(true) 
  }

  const handleSave = async () => {
    setSubmitting(true)
    try {
      const values = await form.validateFields()
      // 从 region_id 获取 region 名称
      const selectedRegion = regions.find(r => r.id === values.region_id)
      const data = {
        ...values,
        region: selectedRegion?.name || '',
        // 上市由“股票交易 → 证券管理”统一办理；公司编辑只保留既有上市资料。
        is_listed: editing?.is_listed || 0,
        stock_symbol: editing?.stock_symbol || '',
        stock_initial_price: editing?.stock_initial_price || 100,
      }
      if (editing) await companyApi.update(editing.id, data)
      else await companyApi.create(data)
      message.success(editing ? '更新成功' : '创建成功')
      setModalOpen(false); load()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await companyApi.delete(id); message.success('已删除'); load()
    } catch {
      message.error('删除失败')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flex: 1 }}>
          <Input prefix={<SearchOutlined />} placeholder="搜索公司/联系人" size="small" style={{ width: 200 }}
            value={search} onChange={e => setSearch(e.target.value)} allowClear />
          <Select placeholder="类型" size="small" style={{ width: 110 }} allowClear
            value={typeFilter} onChange={setTypeFilter}
            options={TYPE_OPTIONS.map(t => ({ value: t, label: t }))} />
          <Select placeholder="区域筛选" size="small" style={{ width: 120 }} allowClear
            value={regionFilter} onChange={setRegionFilter}
            options={regions.map(r => ({ value: r.id, label: r.name }))} />
          <span style={{ fontSize: 11, color: T.textMuted, lineHeight: '24px', marginLeft: 4 }}>
            {filtered.length} / {companies.length}
          </span>
        </div>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>新增公司</Button>
      </div>

      {loading ? (
        <Row gutter={[10, 10]}>
          {[1,2,3,4,5,6].map(i => (
            <Col key={i} xs={24} sm={12} md={8} lg={8}>
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4, padding: '14px 16px' }}>
                <Skeleton active title={{ width: '60%' }} paragraph={{ rows: 1, width: '40%' }} />
                <div style={{ marginTop: 8 }}>
                  <Skeleton.Button active size="small" style={{ width: 50, height: 20, marginRight: 6 }} />
                  <Skeleton.Button active size="small" style={{ width: 60, height: 20 }} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <Skeleton active title={false} paragraph={{ rows: 3 }} />
                </div>
              </div>
            </Col>
          ))}
        </Row>
      ) : (
        <>
          <Row gutter={[10, 10]}>
            {filtered.map(c => (
              <Col key={c.id} xs={24} sm={12} md={8} lg={8}>
                <div style={{
                  background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4,
                  padding: '14px 16px', transition: 'border-color 200ms ease',
                }} className="data-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: T.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </div>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0, marginLeft: 8 }}>
                      <Button type="link" size="small" icon={<EditOutlined />} aria-label={`编辑公司 ${c.name}`} title="编辑公司" onClick={() => openEdit(c)}
                        style={{ color: T.textMuted, padding: '0 4px', height: 22 }} />
                      <Popconfirm title="删除？" onConfirm={() => handleDelete(c.id)}>
                        <Button type="link" size="small" danger icon={<DeleteOutlined />} aria-label={`删除公司 ${c.name}`} title="删除公司"
                          style={{ padding: '0 4px', height: 22 }} />
                      </Popconfirm>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {c.company_type && <span style={{ ...tagStyle, background: 'rgba(59,130,246,0.1)', color: T.accent }}>{c.company_type}</span>}
                    {(c.region_name || c.region) && <span style={tagStyle}>{c.region_name || c.region}</span>}
                    {c.is_listed ? (
                      <Tag color="gold" icon={<StockOutlined />} style={{ margin: 0, fontSize: 11, lineHeight: '18px' }}>已上市</Tag>
                    ) : (
                      <Tag color="default" style={{ margin: 0, fontSize: 11, lineHeight: '18px', color: T.textMuted }}>未上市</Tag>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>
                    {c.contact && <div>联系人: {c.contact}</div>}
                    {c.phone && <div>电话: {c.phone}</div>}
                    {c.email && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>邮箱: {c.email}</div>}
                  </div>
                </div>
              </Col>
            ))}
          </Row>
          {filtered.length === 0 && (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <span style={{ color: T.textPrimary, fontSize: 14, fontWeight: 500 }}>
                    暂无公司
                  </span>
                  <br />
                  <span style={{ color: T.textMuted, fontSize: 12 }}>
                    添加合作伙伴与供应商信息
                  </span>
                </div>
              }
            >
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
                新增公司
              </Button>
            </Empty>
          </div>
        )}
        </>
      )}

      <Modal title={editing ? '编辑公司' : '新增公司'} open={modalOpen} onOk={handleSave}
        onCancel={() => setModalOpen(false)} width={520} confirmLoading={submitting} destroyOnClose>
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="name" label="公司名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="company_type" label="类型">
                <Select options={TYPE_OPTIONS.map(t => ({ value: t, label: t }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="region_id" label="所在区域" rules={[{ required: true, message: '请选择区域' }]}>
                <Select
                  placeholder="选择归属区域"
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
            <Col span={12}><Form.Item name="contact" label="联系人"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="phone" label="电话"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="email" label="邮箱"><Input /></Form.Item>
          <Form.Item name="address" label="地址"><Input /></Form.Item>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item>
          
        </Form>
      </Modal>
    </div>
  )
}

const tagStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', color: T.textSecondary,
  padding: '1px 8px', borderRadius: 3, fontSize: 11, display: 'inline-block',
}

export default CompanyListPage
