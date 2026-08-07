import React, { useEffect, useState } from 'react'
import {
  Table, Button, Modal, Form, Input, Select, Space, Popconfirm,
  Typography, message, Spin
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { companyApi } from '../api/company.api'
import type { Company } from '../../../shared/types'

const CompanyListPage: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const data = await companyApi.list()
      setCompanies(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true) }
  const openEdit = (c: Company) => { setEditing(c); form.setFieldsValue(c); setModalOpen(true) }

  const handleSave = async () => {
    const values = await form.validateFields()
    if (editing) {
      await companyApi.update(editing.id, values)
      message.success('更新成功')
    } else {
      await companyApi.create(values)
      message.success('创建成功')
    }
    setModalOpen(false)
    load()
  }

  const handleDelete = async (id: number) => {
    await companyApi.delete(id)
    message.success('删除成功')
    load()
  }

  const columns = [
    { title: '公司名称', dataIndex: 'name', ellipsis: true },
    { title: '所在区域', dataIndex: 'region', width: 100 },
    { title: '类型', dataIndex: 'company_type', width: 100 },
    { title: '联系人', dataIndex: 'contact', width: 100 },
    { title: '电话', dataIndex: 'phone', width: 130 },
    { title: '邮箱', dataIndex: 'email', width: 180, ellipsis: true },
    {
      title: '操作', width: 120,
      render: (_: unknown, r: Company) => (
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
        <Typography.Title level={4} style={{ margin: 0 }}>公司管理</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增公司</Button>
      </div>
      <Spin spinning={loading}>
        <Table dataSource={companies} rowKey="id" columns={columns} pagination={{ pageSize: 20 }} size="small" scroll={{ x: 900 }} />
      </Spin>
      <Modal title={editing ? '编辑公司' : '新增公司'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} width={520}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="公司名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="region" label="所在区域"><Input /></Form.Item>
          <Form.Item name="company_type" label="公司类型">
            <Select options={[{ value: '施工方', label: '施工方' }, { value: '设计方', label: '设计方' }, { value: '供应商', label: '供应商' }]} />
          </Form.Item>
          <Form.Item name="contact" label="联系人"><Input /></Form.Item>
          <Form.Item name="phone" label="电话"><Input /></Form.Item>
          <Form.Item name="email" label="邮箱"><Input /></Form.Item>
          <Form.Item name="address" label="地址"><Input /></Form.Item>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default CompanyListPage
