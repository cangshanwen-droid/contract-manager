import React, { useEffect, useState } from 'react'
import { Table, Spin, Typography, Tag } from 'antd'
import { api } from '../api/dashboard.api'
import type { InfrastructureType } from '../../../shared/types'

const InfrastructureListPage: React.FC = () => {
  const [data, setData] = useState<InfrastructureType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.infraType.list().then((d) => {
      setData(d as InfrastructureType[])
      setLoading(false)
    })
  }, [])

  const columns = [
    {
      title: '类别', dataIndex: 'category', width: 70,
      render: (v: string) => <Tag color={v === '民生配套' ? 'blue' : 'purple'}>{v}</Tag>
    },
    { title: '基建名称', dataIndex: 'name', width: 120 },
    { title: '单价', dataIndex: 'price', width: 80, render: (v: number) => v?.toLocaleString() },
    { title: '占地面积', dataIndex: 'default_land_area', width: 70, render: (v: number) => v?.toLocaleString() },
    { title: '就业加成', dataIndex: 'population_addition', width: 70, render: (v: number) => v || '-' },
    { title: '引才', dataIndex: 'talent_addition', width: 50, render: (v: number) => v > 0 ? v : '-' },
    { title: '年减排(吨)', dataIndex: 'carbon_reduction', width: 80, render: (v: number) => v > 0 ? <span style={{color:'#10b981'}}>{v}</span> : '-' },
    { title: '幸福指数', dataIndex: 'happiness_index', width: 70, render: (v: number) => v || '-' },
    { title: '收益指数', dataIndex: 'revenue_index', width: 70 },
    { title: '建议比例', dataIndex: 'recommended_ratio', width: 70, render: (v: number) => (v * 100).toFixed(1) + '%' },
  ]

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>基建类型字典</Typography.Title>
      <Spin spinning={loading}>
        <Table dataSource={data} rowKey="id" columns={columns} pagination={false} size="small" />
      </Spin>
    </div>
  )
}

export default InfrastructureListPage
