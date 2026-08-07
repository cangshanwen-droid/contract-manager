import React, { useEffect, useState } from 'react'
import { Card, Select, Row, Col, Spin, Typography, Empty } from 'antd'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart, Area
} from 'recharts'
import { api } from '../api/dashboard.api'
import type { Region, FormulaLog } from '../../../shared/types'

const TrendsPage: React.FC = () => {
  const [regions, setRegions] = useState<Region[]>([])
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null)
  const [logs, setLogs] = useState<FormulaLog[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.region.list().then((d) => setRegions(d as Region[]))
  }, [])

  const handleChange = async (value: number) => {
    setSelectedRegion(value)
    setLoading(true)
    const data = await api.formula.logs(value)
    setLogs(data as FormulaLog[])
    setLoading(false)
  }

  const chartData = logs.map((l) => ({
    round: `第${l.round}轮`,
    happiness: Number(l.output_happiness.toFixed(1)),
    employment: Number(l.output_employment_rate.toFixed(2)),
    population: Math.round(l.output_population_next),
    basePrice: Number(l.output_base_price.toFixed(2)),
    sellPrice: Number(l.output_sell_price.toFixed(2))
  }))

  return (
    <div>
      <Typography.Title level={4}>趋势分析</Typography.Title>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Select
          placeholder="选择区域"
          style={{ width: 240 }}
          options={regions.map((r) => ({ value: r.id, label: r.name }))}
          onChange={handleChange}
          value={selectedRegion}
        />
      </Card>

      <Spin spinning={loading}>
        {chartData.length === 0 ? (
          <Empty description="请选择区域并先进行模拟计算" style={{ marginTop: 60 }} />
        ) : (
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Card title="幸福度变化趋势" size="small">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="round" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="happiness" stroke="#1890ff" name="幸福度" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </Col>
            <Col span={12}>
              <Card title="就业率变化趋势" size="small">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="round" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="employment" stroke="#52c41a" name="就业率(%)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </Col>
            <Col span={12}>
              <Card title="人口变化趋势" size="small">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="round" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="population" fill="#722ed1" name="人口" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
            <Col span={12}>
              <Card title="基准价与成交价" size="small">
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="round" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="basePrice" fill="#fa8c16" name="基准价" />
                    <Line type="monotone" dataKey="sellPrice" stroke="#eb2f96" name="成交价" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          </Row>
        )}
      </Spin>
    </div>
  )
}

export default TrendsPage
