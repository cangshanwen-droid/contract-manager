import React, { useEffect, useState } from 'react'
import {
  Table, Button, Modal, Form, Input, Select, Space, Popconfirm,
  Typography, message, Empty, Tag, Tabs
} from 'antd'
import { PlusOutlined, DeleteOutlined, NotificationOutlined, AuditOutlined } from '@ant-design/icons'
import { IPC_CHANNELS } from '../../../shared/constants'
import { invoke } from '../api/cloudApi'
import { api } from '../api/dashboard.api'
import { tokens as T } from '../styles/design-tokens'
import { useAuth } from '../context/AuthContext'
import AuditLogPanel from '../components/AuditLogPanel'

const { TextArea } = Input

const priorityColors: Record<string, string> = { high: 'red', normal: 'blue', low: 'default' }
const priorityLabels: Record<string, string> = { high: '紧急', normal: '公告', low: '通知' }

const AnnouncementPage: React.FC = () => {
  const user = useAuth()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [form] = Form.useForm()
  const [filterPriority, setFilterPriority] = useState<string | undefined>()
  const [activeTab, setActiveTab] = useState<string>('announcement')
  const [regions, setRegions] = useState<{ id: number; name: string }[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const list = await invoke(IPC_CHANNELS.ANNOUNCEMENT_LIST, { priority: filterPriority }) as any[]
      setItems(list)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filterPriority])

  // 加载区域列表（公告「所属区域」下拉）
  useEffect(() => {
    api.region.list().then((rs) => {
      if (Array.isArray(rs)) setRegions(rs as { id: number; name: string }[])
    }).catch(() => { /* 区域加载失败静默，仅影响下拉 */ })
  }, [])

  // ── 快捷键：Escape 关闭弹窗 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (createOpen) setCreateOpen(false)
        if (detail) setDetail(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createOpen, detail])

  const handleCreate = async () => {
    try {
      const vals = await form.validateFields()
      // 发布者：默认当前登录人，允许手动修改为实际发布人（admin/operator 操作）
      const publisher = (vals.created_by || '').trim() || user?.username || 'admin'
      await invoke(IPC_CHANNELS.ANNOUNCEMENT_CREATE, { ...vals, created_by: publisher })
      message.success('公告发布成功')
      form.resetFields(); setCreateOpen(false); load()
    } catch (err: any) { if (err?.errorFields) return; message.error(err?.message || '发布失败') }
  }

  const handleDelete = async (id: number) => {
    try {
      await invoke(IPC_CHANNELS.ANNOUNCEMENT_DELETE, id)
      message.success('公告已删除'); load()
    } catch (err: any) { message.error(err?.message || '删除失败') }
  }

  const columns = [
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true,
      render: (v: string, r: any) => <a onClick={() => setDetail(r)} style={{color:T.accent}}>{v}</a> },
    { title: '优先级', dataIndex: 'priority', key: 'priority', width: 70,
      render: (v: string) => <Tag color={priorityColors[v]}>{priorityLabels[v]}</Tag> },
    { title: '区域', dataIndex: 'region_name', key: 'region', width: 80,
      render: (v: string) => v || <Tag>全局</Tag> },
    { title: '发布者', dataIndex: 'created_by', key: 'by', width: 80 },
    { title: '时间', dataIndex: 'created_at', key: 'time', width: 140,
      render: (v: string) => v?.slice(0, 16) },
    { title: '操作', key: 'action', width: 60,
      render: (_: any, r: any) => (
        <Popconfirm title="确定删除此公告？" onConfirm={() => handleDelete(r.id)}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      )},
  ]

  // ── Tab 切换 ──
  const tabItems = [
    {
      key: 'announcement',
      label: <span><NotificationOutlined />公告管理</span>,
      children: (
        <>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div className="section-title" style={{ margin:0, border:'none', padding:0 }}>
              <NotificationOutlined style={{ marginRight: 8 }} />公告管理
            </div>
            <Space>
              <Select placeholder="优先级" size="small" style={{ width: 100 }} allowClear
                value={filterPriority} onChange={setFilterPriority}
                options={[{value:'high',label:'紧急'},{value:'normal',label:'公告'},{value:'low',label:'通知'}]} />
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>发布公告</Button>
            </Space>
          </div>

          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4 }}>
            <Table dataSource={items} rowKey="id" columns={columns} pagination={{ pageSize: 15 }} size="small" loading={loading}
              locale={{ emptyText:
                <div style={{ padding: '24px 0' }}>
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <div>
                        <span style={{ color: T.textPrimary, fontSize: 14, fontWeight: 500 }}>
                          暂无公告
                        </span>
                        <br />
                        <span style={{ color: T.textMuted, fontSize: 12 }}>
                          发布系统公告和通知
                        </span>
                      </div>
                    }
                  >
                    <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                      发布公告
                    </Button>
                  </Empty>
                </div>
              }} />
          </div>
        </>
      )
    }
  ]

  // admin 可见：操作日志 Tab（复用共享 AuditLogPanel）
  if (user?.role === 'admin') {
    tabItems.push({
      key: 'audit',
      label: <span><AuditOutlined />操作日志</span>,
      children: <AuditLogPanel />
    })
  }

  return (
    <div className="page-fade-in">
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      <Modal title="发布公告" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={handleCreate}
        okText="发布" width={560} destroyOnClose>
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="title" label="标题" rules={[{required:true,message:'请输入标题'}]}>
            <Input placeholder="例如：A区基础设施招标公告" />
          </Form.Item>
          <Form.Item name="content" label="正文" rules={[{required:true,message:'请输入正文'}]}>
            <TextArea rows={4} placeholder="公告正文内容..." />
          </Form.Item>
          <Form.Item name="priority" label="优先级" initialValue="normal">
            <Select options={[{value:'high',label:'紧急'},{value:'normal',label:'公告'},{value:'low',label:'通知'}]} />
          </Form.Item>
          <Form.Item name="region_id" label="所属区域" tooltip="不选择则公告对全局可见">
            <Select
              placeholder="全局（不选）"
              allowClear
              options={regions.map(r => ({ value: r.id, label: r.name }))}
            />
          </Form.Item>
          <Form.Item name="created_by" label="发布者" initialValue={user?.username || 'admin'}
            tooltip="默认当前登录人，可手动修改为实际发布人">
            <Input placeholder={user?.username || 'admin'} maxLength={30} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="公告详情" open={!!detail} onCancel={() => setDetail(null)} footer={null} width={600} destroyOnClose>
        {detail && (
          <>
            <Typography.Title level={4} style={{marginTop:0}}>{detail.title}</Typography.Title>
            <div style={{marginBottom:12,fontSize:12,color:T.textMuted}}>
              <Tag color={priorityColors[detail.priority]}>{priorityLabels[detail.priority]}</Tag>
              {detail.region_name ? `${detail.region_name}` : '全局'} · {detail.created_by} · {detail.created_at?.slice(0,16)}
            </div>
            <div style={{fontSize:14,lineHeight:1.8,color:T.textPrimary,whiteSpace:'pre-wrap'}}>{detail.content}</div>
          </>
        )}
      </Modal>
    </div>
  )
}

export default AnnouncementPage
