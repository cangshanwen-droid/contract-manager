import React, { useEffect, useState } from 'react'
import { Row, Col, Card, Statistic, Table, Spin, Typography } from 'antd'
import {
  EnvironmentOutlined,
  FileTextOutlined,
  TeamOutlined,
  DashboardOutlined,
  RiseOutlined,
  FallOutlined
} from '@ant-design/icons'
import { dashboardApi } from '../api/dashboard.api'
import type { DashboardSummary } from '../../../shared/types'

const StatCard: React.FC<{
  title: string
  value: number | string
  icon: React.ReactNode
  suffix?: string
  precision?: number
  color?: string
  trend?: 'up' | 'down'
  delay?: number
}> = ({ title, value, icon, suffix, precision = 0, color = '#e8edf5', trend, delay = 0 }) => (
  <div className="animate-in stat-card" style={{ animationDelay: `${delay}s` }}>
    <Card
      className="glass-card"
      size="small"
      style={{ height: '100%' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Statistic
          title={title}
          value={value}
          suffix={suffix}
          precision={precision}
          valueStyle={{ color, fontFamily: "'JetBrains Mono', monospace", fontSize: 24 }}
        />
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'rgba(245, 158, 11, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            color: '#f59e0b'
          }}
        >
          {icon}
        </div>
      </div>
      {trend && (
        <div style={{ marginTop: 8, fontSize: 12, color: trend === 'up' ? '#10b981' : '#ef4444' }}>
          {trend === 'up' ? <RiseOutlined /> : <FallOutlined />}
          <span style={{ marginLeft: 4 }}>
            {trend === 'up' ? '较上期增长' : '较上期下降'}
          </span>
        </div>
      )}
    </Card>
  </div>
)

const DashboardPage: React.FC = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const s = await dashboardApi.summary()
        setSummary(s)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Typography.Title level={4} style={{ color: '#e8edf5', margin: 0, fontSize: 18 }}>
          系统概览
        </Typography.Title>
        <Typography.Text style={{ color: '#64748b', fontSize: 12, marginTop: 4, display: 'block' }}>
          基础设施合同管理 · 区域模拟数据总览
        </Typography.Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col span={6}>
          <StatCard
            title="区域数量"
            value={summary?.total_regions || 0}
            icon={<EnvironmentOutlined />}
            delay={0.05}
            color="#06b6d4"
          />
        </Col>
        <Col span={6}>
          <StatCard
            title="合同总数"
            value={summary?.total_contracts || 0}
            icon={<FileTextOutlined />}
            delay={0.1}
            color="#f59e0b"
          />
        </Col>
        <Col span={6}>
          <StatCard
            title="合作公司"
            value={summary?.total_companies || 0}
            icon={<TeamOutlined />}
            delay={0.15}
            color="#10b981"
          />
        </Col>
        <Col span={6}>
          <StatCard
            title="总占地面积"
            value={summary?.total_land_area || 0}
            suffix="㎡"
            icon={<DashboardOutlined />}
            precision={0}
            delay={0.2}
            color="#8b5cf6"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
        <Col span={6}>
          <StatCard
            title="平均幸福度"
            value={summary?.avg_happiness || 0}
            suffix="/ 100"
            icon={<RiseOutlined />}
            precision={1}
            delay={0.25}
            color={(summary?.avg_happiness || 0) > 60 ? '#10b981' : '#f59e0b'}
          />
        </Col>
        <Col span={6}>
          <StatCard
            title="平均就业率"
            value={summary?.avg_employment || 0}
            suffix="%"
            icon={<RiseOutlined />}
            precision={2}
            delay={0.3}
            color="#06b6d4"
          />
        </Col>
      </Row>

      <div className="animate-in" style={{ animationDelay: '0.35s', marginTop: 20 }}>
        <Card
          className="glass-card"
          title={
            <span style={{ color: '#e8edf5', fontSize: 14 }}>
              最近合同
            </span>
          }
          size="small"
        >
          <Table
            dataSource={[]}
            rowKey="id"
            columns={[
              { title: '合同编号', dataIndex: 'contract_no', width: 160 },
              { title: '合同名称', dataIndex: 'contract_name' },
              { title: '对方公司', dataIndex: 'party_b_name' },
              { title: '状态', dataIndex: 'status' }
            ]}
            pagination={false}
            locale={{ emptyText: '暂无合同数据，点击右上角新建合同' }}
            size="small"
          />
        </Card>
      </div>
    </div>
  )
}

export default DashboardPage
