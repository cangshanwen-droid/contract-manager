import React, { useEffect, useState } from 'react'
import {
  Table, Button, Modal, Form, Input, InputNumber, Space, Popconfirm,
  Typography, message, Spin
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { regionApi } from '../api/region.api'
import type { Region } from '../../../shared/types'

const RegionListPage: React.FC = () => {
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Region | null>(null)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const data = await regionApi.list()
      setRegions(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (r: Region) => {
    setEditing(r)
    form.setFieldsValue(r)
    setModalOpen(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    if (editing) {
      await regionApi.update(editing.id, values)
      message.success('更新成功')
    } else {
      await regionApi.create(values)
      message.success('创建成功')
    }
    setModalOpen(false)
    load()
  }

  const handleDelete = async (id: number) => {
    await regionApi.delete(id)
    message.success('删除成功')
    load()
  }

  const columns = [
    { title: '区域名称', dataIndex: 'name', width: 140 },
    { title: '人口', dataIndex: 'population', width: 120, render: (v: number) => v.toLocaleString() },
    { title: '高素质人才', dataIndex: 'talent_population', width: 120, render: (v: number) => v.toLocaleString() },
    { title: '碳排放', dataIndex: 'carbon_emissions', width: 120, render: (v: number) => v.toLocaleString() },
    { title: '承载力上限', dataIndex: 'population_capacity', width: 130, render: (v: number) => v.toLocaleString() },
    { title: '基础增长率', dataIndex: 'base_growth_rate', width: 110, render: (v: number) => `${(v * 100).toFixed(1)}%` },
    {
      title: '当前幸福度',
      dataIndex: 'current_happiness',
      width: 110,
      render: (v: number | null) => (v !== null ? v.toFixed(1) : '-')
    },
    {
      title: '当前就业率',
      dataIndex: 'current_employment_rate',
      width: 110,
      render: (v: number | null) => (v !== null ? `${v.toFixed(2)}%` : '-')
    },
    {
      title: '操作',
      width: 140,
      render: (_: unknown, r: Region) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>区域管理</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增区域
        </Button>
      </div>
      <Spin spinning={loading}>
        <Table
          dataSource={regions}
          rowKey="id"
          columns={columns}
          pagination={{ pageSize: 20 }}
          size="small"
          scroll={{ x: 1100 }}
        />
      </Spin>

      <Modal
        title={editing ? '编辑区域' : '新增区域'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={520}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="区域名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="population" label="人口" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="talent_population" label="高素质人才数量">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="carbon_emissions" label="碳排放量">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="population_capacity" label="人口承载力上限">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="base_growth_rate" label="基础增长率">
            <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default RegionListPage
