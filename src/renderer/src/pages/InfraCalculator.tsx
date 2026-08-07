import React, { useEffect, useState, useCallback } from 'react'
import {
  Card, Table, Select, Spin, Typography, Row, Col, Statistic, Button,
  Tag, message, Space, Alert
} from 'antd'
import {
  CalculatorOutlined, FileAddOutlined, ArrowUpOutlined,
  DollarOutlined, ToolOutlined, BuildOutlined
} from '@ant-design/icons'
import { IPC_CHANNELS } from '../../../shared/constants'
import { api } from '../api/dashboard.api'
import type { Region } from '../../../shared/types'

const invoke = (ch: string, ...args: unknown[]) => window.api.invoke(ch, ...args)

interface InfraCalcItem {
  name: string
  category: string
  land_area: number
  price: number
  revenue_index: number
  recommended_ratio: number
  maintenance_fee: number
  current_qty: number
  current_ratio: number
  suggested_qty: number
  gap: number
  annual_revenue: number
  total_maintenance: number
  build_cost: number
  population_addition: number
  talent_addition: number
  happiness_index: number
  h_bonus: number
  carbon_reduction: number
  activation_price: number
  annual_usage_fee: number
  actual_carbon_reduction: number
  net_operating_cost: number
}

interface CalcSummary {
  population: number
  baseline_carbon: number
  total_current: number
  total_revenue: number
  total_maintenance: number
  total_build_cost: number
  total_carbon_reduction: number
  effective_carbon_reduction: number
  net_carbon_emission: number
  total_usage_fee: number
  items: InfraCalcItem[]
}

const InfraCalculator: React.FC = () => {
  const [regions, setRegions] = useState<Region[]>([])
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null)
  const [data, setData] = useState<CalcSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    api.region.list().then((d) => setRegions(d as Region[]))
  }, [])

  const loadData = useCallback(async (regionId: number) => {
    setLoading(true)
    try {
      const result = await invoke(IPC_CHANNELS.INFRA_CALC_LOAD, regionId) as CalcSummary
      setData(result)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRegionChange = (value: number) => {
    setSelectedRegion(value)
    loadData(value)
  }

  const handleGenerateContract = async () => {
    if (!data || !selectedRegion) return
    const gapItems = data.items.filter((i) => i.gap > 0)
    if (gapItems.length === 0) {
      message.info('所有基建数量已达标，无需新建')
      return
    }

    setGenerating(true)
    try {
      const region = regions.find((r) => r.id === selectedRegion)
      const items = gapItems.map((item) => ({
        item_name: item.name,
        quantity: item.gap,
        unit_price: item.price,
        land_area: item.land_area,
        tax_rate: 0
      }))

      await invoke(IPC_CHANNELS.CONTRACT_CREATE, {
        contract_name: `${region?.name || ''}基建补建计划`,
        contract_type_id: 1,
        region_id: selectedRegion,
        party_a: '我方公司',
        status: 'active',
        items
      })

      message.success(`已生成合同，包含 ${gapItems.length} 种基建，共 ${items.reduce((s, i) => s + i.quantity, 0)} 个`)
      loadData(selectedRegion)
    } catch (err) {
      message.error('生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const needBuild = data?.items.filter((i) => i.gap > 0) || []

  const columns = [
    { title: '基建类型', dataIndex: 'name', width: 120, fixed: 'left' as const },
    {
      title: '类别', dataIndex: 'category', width: 70,
      render: (v: string) => <Tag color={v === '民生配套' ? 'blue' : 'purple'}>{v}</Tag>
    },
    { title: '当前数量', dataIndex: 'current_qty', width: 70 },
    { title: '建议数量', dataIndex: 'suggested_qty', width: 70 },
    {
      title: '差额', dataIndex: 'gap', width: 60,
      render: (v: number) =>
        v > 0 ? <span style={{ color: '#cf1322', fontWeight: 600 }}>+{v}</span> :
          v < 0 ? <span style={{ color: '#3f8600' }}>{v}</span> : <span>-</span>
    },
    { title: '单价', dataIndex: 'price', width: 70, render: (v: number) => v >= 10000 ? (v/10000).toFixed(0)+'万' : v.toLocaleString() },
    { title: '建造成本', dataIndex: 'build_cost', width: 80, render: (v: number) => v > 0 ? <Tag color="red">{(v/10000).toFixed(0)}万</Tag> : '-' },
    {
      title: '年收益', dataIndex: 'annual_revenue', width: 80,
      render: (v: number) => v > 0 ? <Tag color="green">{v.toLocaleString()}</Tag> : '-',
      sorter: (a: InfraCalcItem, b: InfraCalcItem) => a.annual_revenue - b.annual_revenue
    },
    { title: '引才', dataIndex: 'talent_addition', width: 40, render: (v: number) => v > 0 ? v : '' },
    {
      title: '使用费/年', dataIndex: 'annual_usage_fee', width: 80,
      render: (v: number) => v > 0 ? <span style={{color:'#f59e0b'}}>{(v/10000).toFixed(0)}万</span> : ''
    },
    {
      title: '经营净成本', dataIndex: 'net_operating_cost', width: 80,
      render: (v: number) => v > 0 ? <span style={{color:'#ef4444'}}>+{(v/10000).toFixed(0)}万</span> : v < 0 ? <span style={{color:'#10b981'}}>{(v/10000).toFixed(0)}万</span> : '-'
    },
    { title: '减排/年', dataIndex: 'actual_carbon_reduction', width: 70, render: (v: number) => v > 0 ? <span style={{color:'#10b981'}}>{v}吨</span> : '' },
  ]

  return (
    <div>
      {/* 顶栏：标题 + 区域选择 + 操作按钮 */}
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16, gap: 16
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Typography.Title level={4} style={{ margin: 0, whiteSpace: 'nowrap' }}>
            基建辅助计算器
          </Typography.Title>
          <Select
            placeholder="选择区域"
            style={{ width: 200 }}
            value={selectedRegion}
            onChange={handleRegionChange}
            options={regions.map((r) => ({ value: r.id, label: r.name }))}
            size="middle"
          />
        </div>
        <Button
          type="primary"
          icon={<FileAddOutlined />}
          onClick={handleGenerateContract}
          loading={generating}
          disabled={!data || needBuild.length === 0}
          size="middle"
        >
          一键生成补建合同 {needBuild.length > 0 ? `(${needBuild.length}项)` : ''}
        </Button>
      </div>

      <Spin spinning={loading}>
        {data && (
          <>
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              <Col span={3}>
                <Card size="small">
                  <Statistic title="区域人口" value={data.population} prefix={<CalculatorOutlined />} />
                </Card>
              </Col>
              <Col span={3}>
                <Card size="small">
                  <Statistic title="基建总数" value={data.total_current} prefix={<BuildOutlined />} />
                </Card>
              </Col>
              <Col span={3}>
                <Card size="small">
                  <Statistic title="年收益" value={data.total_revenue} prefix={<DollarOutlined />}
                    precision={0} valueStyle={{ color: '#3f8600' }} />
                </Card>
              </Col>
              <Col span={3}>
                <Card size="small">
                  <Statistic title="年维护费" value={data.total_maintenance} prefix={<ToolOutlined />}
                    precision={0} valueStyle={{ color: '#cf1322' }} />
                </Card>
              </Col>
              <Col span={3}>
                <Card size="small">
                  <Statistic title="需投入" value={data.total_build_cost} prefix={<ArrowUpOutlined />}
                    precision={0} valueStyle={{ color: data.total_build_cost > 0 ? '#cf1322' : '#3f8600' }} />
                </Card>
              </Col>
              <Col span={3}>
                <Card size="small">
                  <Statistic title="净收益" value={data.total_revenue - data.total_maintenance}
                    prefix={<DollarOutlined />} precision={0}
                    valueStyle={{ color: (data.total_revenue - data.total_maintenance) >= 0 ? '#3f8600' : '#cf1322' }} />
                </Card>
              </Col>
              <Col span={3}>
                <Card size="small">
                  <Statistic title="基础碳排放" value={data.baseline_carbon}
                    suffix="吨" precision={0}
                    valueStyle={{ color: '#ef4444' }} />
                </Card>
              </Col>
              <Col span={3}>
                <Card size="small">
                  <Statistic title="实际减排(下限2000)" value={data.effective_carbon_reduction}
                    suffix="吨" precision={0}
                    valueStyle={{ color: '#10b981' }} />
                </Card>
              </Col>
            </Row>
            <Card title="基建明细" size="small" extra={
              <Space>
                <Tag color="red">需新建</Tag>
                <Tag color="green">已达标</Tag>
              </Space>
            }>
              <Table
                dataSource={data.items}
                rowKey="name"
                columns={columns}
                pagination={false}
                size="small"
                scroll={{ x: 1000 }}
                rowClassName={(r) => r.gap > 0 ? 'row-need-build' : 'row-ok'}
              />
            </Card>

            {/* 底部汇总条 */}
            <div
              style={{
                marginTop: 12,
                padding: '12px 16px',
                borderRadius: 6,
                background: '#1a2332',
                border: '1px solid #2d3a4e',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: '#94a3b8'
              }}
            >
              <span>建议数量 = 人口 × 建议比例  |  差额为正 = 需新建</span>
              <span>
                共 {data.items.filter(i => i.gap > 0).length} 项需新建 ·
                总投资 <span style={{ color: '#f59e0b', fontWeight: 600 }}>{(data.total_build_cost / 10000).toFixed(0)}万</span> ·
                年减排 <span style={{ color: '#10b981', fontWeight: 600 }}>{data.total_carbon_reduction}吨</span>
              </span>
            </div>
            <style>{`
              .row-need-build { background-color: rgba(239,68,68,0.08); }
              .row-ok { background-color: rgba(16,185,129,0.06); }
            `}</style>
          </>
        )}
        {!data && !loading && selectedRegion && (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            已选择区域，暂无合同数据。请先录入基建合同。
          </div>
        )}
      </Spin>
    </div>
  )
}

export default InfraCalculator
