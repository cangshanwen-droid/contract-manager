import React, { useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Input, InputNumber, Space, Popconfirm, Typography, message } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { regionApi } from '../api/region.api'
import type { Region } from '../../../shared/types'
import { formatNumber, formatPercentDirect, formatTrendWithValue, POSITIVE_COLOR, NEGATIVE_COLOR } from '../utils/format'

// ── Import unified design tokens ──
import { tokens as T } from '../styles/design-tokens'

const RegionListPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Region | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  // 支持 URL 参数 ?q=（全局搜索跳转）
  const [q, setQ] = useState(searchParams.get('q') || '')

  const load = async () => {
    setLoading(true)
    setRegions(await regionApi.list())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── 快捷键：Escape 关闭弹窗，Enter 提交表单 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalOpen) { setModalOpen(false); e.preventDefault() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modalOpen])

  // ── 全局快捷键 Ctrl+Shift+N → 打开新建区域弹窗（AppLayout 派发事件） ──
  useEffect(() => {
    const handler = () => {
      setEditing(null)
      form.resetFields()
      setModalOpen(true)
    }
    window.addEventListener('gipfel:create-region', handler)
    return () => window.removeEventListener('gipfel:create-region', handler)
  }, [form])

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true) }
  const openEdit = (r: Region) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true) }

  // 搜索过滤（名称匹配）
  const filteredRegions = regions.filter(r => !q || r.name.toLowerCase().includes(q.trim().toLowerCase()))

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const values = await form.validateFields()
      if (editing) await regionApi.update(editing.id, values)
      else await regionApi.create(values)
      message.success(editing ? '更新成功' : '创建成功')
      setModalOpen(false)
      load()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await regionApi.delete(id)
      message.success('删除成功')
      load()
    } catch {
      message.error('删除失败')
    }
  }

  const avgGrowth = ((regions.reduce((s, r) => s + r.base_growth_rate, 0) / Math.max(1, regions.length)) * 100).toFixed(1)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>区域管理</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input prefix={<SearchOutlined />} placeholder="搜索区域名称" size="small" style={{ width: 180 }}
            allowClear value={q} onChange={e => setQ(e.target.value)} />
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>创建区域</Button>
        </div>
      </div>

      {/* KPI 卡片 — 暖金点缀 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 12 }}>
        {[
        { l: '区域数量', v: regions.length },
        { l: '总人口', v: (regions.reduce((s, r) => s + r.population, 0) / 10000).toFixed(0) + '万', warm: true },
        { l: '平均增长率', v: avgGrowth + '%', warm: true },
        { l: '总人才', v: regions.reduce((s, r) => s + r.talent_population, 0).toLocaleString(), warm: true },
        ].map((k, i) => (
        <div key={i} style={{
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderLeft: k.warm ? `3px solid ${T.warmGold}` : `3px solid ${T.accent}`,
          borderRadius: 4,
          padding: '12px 16px',
        }}>
          <div style={{ fontSize: 11, color: T.silverMut }}>{k.l}</div>
          <div style={{
            fontFamily: "'JetBrains Mono', 'Consolas', monospace",
            fontSize: 20, fontWeight: 700,
            color: k.warm ? T.warmGold : T.accent,
            marginTop: 4,
          }}>{k.v}</div>
        </div>
        ))}
      </div>

      {/* 表格 — 面板包裹 + 暖色行悬停 */}
      <div style={{
        background: T.bgPanel,
        border: `1px solid ${T.border}`,
        borderRadius: 4,
      }}>
        <Table
          dataSource={filteredRegions} rowKey="id" loading={loading} size="small"
          className="dense-table"
          showSorterTooltip={{ title: '点击排序' }}
          rowClassName={(_r, idx) => idx % 2 === 0 ? 'row-even-warm' : 'row-odd'}
          columns={[
            { title: '名称', dataIndex: 'name', width: 80, render: (v: string) => <span style={{ color: T.silver, fontWeight: 500 }}>{v}</span> },
            { title: '人口', dataIndex: 'population', width: 100, align: 'right' as const, sorter: (a: Region, b: Region) => (a.population || 0) - (b.population || 0),
              render: (v: number) => <span style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace" }}>{v?.toLocaleString()}</span> },
            { title: '人才', dataIndex: 'talent_population', width: 80, align: 'right' as const, sorter: (a: Region, b: Region) => (a.talent_population || 0) - (b.talent_population || 0),
              render: (v: number) => <span style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace" }}>{v?.toLocaleString()}</span> },
            { title: '碳排', dataIndex: 'carbon_emissions', width: 80, align: 'right' as const, sorter: (a: Region, b: Region) => (a.carbon_emissions || 0) - (b.carbon_emissions || 0),
              render: (v: number) => <span style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace", color: v > 500 ? NEGATIVE_COLOR : T.silverSec }}>{v?.toLocaleString()}</span> },
            { title: '承载力', dataIndex: 'population_capacity', width: 90, align: 'right' as const, sorter: (a: Region, b: Region) => (a.population_capacity || 0) - (b.population_capacity || 0),
              render: (v: number) => <span style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace" }}>{v?.toLocaleString()}</span> },
            { title: '增长率', dataIndex: 'base_growth_rate', width: 70, align: 'right' as const, sorter: (a: Region, b: Region) => (a.base_growth_rate || 0) - (b.base_growth_rate || 0),
              render: (v: number) => (
                <span style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace", color: v >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>
                  {formatTrendWithValue(v * 100, '%')}
                </span>
              )},
            { title: '幸福', dataIndex: 'current_happiness', width: 65, align: 'right' as const, sorter: (a: Region, b: Region) => (a.current_happiness || 0) - (b.current_happiness || 0),
              render: (v: any) => v != null ? <span style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace", color: v > 60 ? POSITIVE_COLOR : T.silverSec }}>{v.toFixed(1)}</span> : <span style={{ color: T.silverMut }}>—</span> },
            { title: '操作', width: 120, render: (_: any, r: Region) => (
              <Space size={4}>
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} style={{ padding: '0 4px', color: T.silverSec }} />
                <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
                  <Button type="link" size="small" danger icon={<DeleteOutlined />} style={{ padding: '0 4px' }} />
                </Popconfirm>
              </Space>
            )},
          ]}
        />
      </div>

      {/* 表格标尺行样式 */}
      <style>{`
        .row-even-warm td { background-color: rgba(180,140,80,0.03) !important; }
        .row-odd td { background-color: transparent !important; }
        .dense-table .ant-table-row:hover td {
          background-color: rgba(180,140,80,0.06) !important;
        }
      `}</style>

      <Modal
        title={editing ? '编辑区域' : '创建区域'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        width={440}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="compact-form">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item name="population" label="人口" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="talent_population" label="人才" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item name="carbon_emissions" label="碳排放" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="population_capacity" label="承载力" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="base_growth_rate" label="基础增长率" initialValue={0.03}>
            <InputNumber min={0} max={1} step={0.01} style={{ width: 120 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default RegionListPage
