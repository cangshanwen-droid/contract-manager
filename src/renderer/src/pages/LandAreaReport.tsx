import React, { useEffect, useState } from 'react'
import { Card, Table, Spin, Typography, Row, Col, Statistic } from 'antd'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell
} from 'recharts'
import { IPC_CHANNELS } from '../../../shared/constants'

const COLORS = ['#1890ff', '#52c41a', '#722ed1', '#fa8c16', '#eb2f96', '#13c2c2', '#f5222d']

const invoke = (ch: string, ...args: unknown[]) => window.api.invoke(ch, ...args)

const LandAreaReport: React.FC = () => {
  const [detailData, setDetailData] = useState<any[]>([])
  const [regionSummary, setRegionSummary] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      invoke(IPC_CHANNELS.REPORT_LAND_AREA),
      invoke(IPC_CHANNELS.REPORT_LAND_AREA_BY_REGION)
    ]).then(([detail, summary]) => {
      setDetailData(detail as any[])
      setRegionSummary(summary as any[])
      setLoading(false)
    })
  }, [])

  const totalLandArea = regionSummary.reduce((s: number, r: any) => s + r.total_land_area, 0)

  const detailColumns = [
    { title: '区域', dataIndex: 'region_name', width: 100 },
    { title: '基建类型', dataIndex: 'item_name', width: 120 },
    { title: '数量', dataIndex: 'total_quantity', width: 80 },
    { title: '总占地面积(㎡)', dataIndex: 'total_land_area', width: 130,
      render: (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 })
    }
  ]

  const regionColumns = [
    { title: '区域', dataIndex: 'region_name', width: 100 },
    { title: '合同数', dataIndex: 'contract_count', width: 80 },
    { title: '基建项数', dataIndex: 'total_items', width: 80 },
    { title: '总占地面积(㎡)', dataIndex: 'total_land_area', width: 130,
      render: (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 })
    }
  ]

  // 按区域分组的基建类型数据
  const regionNames = [...new Set(detailData.map(d => d.region_name))]
  const barData = regionSummary.map(r => ({
    name: r.region_name,
    area: Number(r.total_land_area.toFixed(2))
  }))

  const pieData = detailData.map(d => ({
    name: `${d.region_name}-${d.item_name}`,
    value: Number(d.total_land_area.toFixed(2))
  }))

  return (
    <div>
      <Typography.Title level={4}>占地面积报表</Typography.Title>
      <Spin spinning={loading}>
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic title="总占地面积" value={totalLandArea} suffix="㎡" precision={2} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="区域数" value={regionNames.length} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="基建类型数" value={detailData.length} />
            </Card>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Card title="各区域占地面积对比" size="small">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3a4e" />
                  <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: '#1e293b',
                      border: '1px solid #2d3a4e',
                      borderRadius: 8,
                      color: '#e8edf5',
                      fontSize: 12
                    }}
                    formatter={(v: number) => [`${v.toFixed(2)} ㎡`, '占地面积']}
                  />
                  <Bar dataKey="area" fill="#f59e0b" name="占地面积(㎡)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
          <Col span={12}>
            <Card title="占地面积分布" size="small">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#1e293b',
                      border: '1px solid #2d3a4e',
                      borderRadius: 8,
                      color: '#e8edf5',
                      fontSize: 12
                    }}
                    formatter={(v: number) => [`${v.toFixed(2)} ㎡`, '占地面积']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={12}>
            <Card title="按区域汇总" size="small">
              <Table dataSource={regionSummary} rowKey="region_name"
                columns={regionColumns} pagination={false} size="small" />
            </Card>
          </Col>
          <Col span={12}>
            <Card title="按基建类型明细" size="small">
              <Table dataSource={detailData} rowKey={(r) => `${r.region_name}-${r.item_name}`}
                columns={detailColumns} pagination={false} size="small" />
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  )
}

export default LandAreaReport
