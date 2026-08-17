import React, { useEffect, useState, useCallback } from 'react'
import {
  Card, Table, Select, Spin, Typography, Row, Col, Statistic, Button,
  Tag, message, Space, Alert
} from 'antd'
import {
  FileAddOutlined
} from '@ant-design/icons'
import { IPC_CHANNELS } from '../../../shared/constants'
import { api } from '../api/dashboard.api'
import { invoke } from '../api/cloudApi'
import type { Region } from '../../../shared/types'
import { tokens as T } from '../styles/design-tokens'

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
    } catch {
      message.error('加载基建数据失败')
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
      render: (v: string) => <Tag color="blue">{v}</Tag>
    },
    { title: '当前数量', dataIndex: 'current_qty', width: 70 },
    { title: '建议数量', dataIndex: 'suggested_qty', width: 70 },
    {
      title: '差额', dataIndex: 'gap', width: 60,
      render: (v: number) =>
        v > 0 ? <span style={{ color: T.red, fontWeight: 600 }}>+{v}</span> :
          v < 0 ? <span style={{ color: T.green }}>{v}</span> : <span>-</span>
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
      render: (v: number) => v > 0 ? <span style={{color:T.accent}}>{(v/10000).toFixed(0)}万</span> : ''
    },
    {
      title: '经营净成本', dataIndex: 'net_operating_cost', width: 80,
      render: (v: number) => v > 0 ? <span style={{color:T.red}}>+{(v/10000).toFixed(0)}万</span> : v < 0 ? <span style={{color:T.green}}>{(v/10000).toFixed(0)}万</span> : '-'
    },
    { title: '减排值', dataIndex: 'actual_carbon_reduction', width: 70, render: (v: number) => v > 0 ? <span style={{color:T.green}}>{v}</span> : '' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>基建计算</div>
          <Select placeholder="选择区域" style={{ width: 180 }} size="small"
            value={selectedRegion} onChange={handleRegionChange}
            options={regions.map((r) => ({ value: r.id, label: r.name }))} />
        </div>
        <Button type="primary" size="small" icon={<FileAddOutlined />} onClick={handleGenerateContract}
          loading={generating} disabled={!data || needBuild.length === 0}>
          补建合同{needBuild.length > 0 ? ` (${needBuild.length})` : ''}
        </Button>
      </div>

      {!selectedRegion && (
        <div style={{ maxWidth: 420, margin: '100px auto', textAlign: 'center' }}>
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ marginBottom: 16, opacity: 0.4 }}>
            <rect x="2" y="2" width="76" height="76" rx="4" stroke={T.silver3} strokeWidth="1.5" />
            <rect x="18" y="46" width="12" height="30" rx="2" fill={T.silver3} opacity="0.5" />
            <rect x="34" y="28" width="12" height="48" rx="2" fill={T.silver3} opacity="0.5" />
            <rect x="50" y="36" width="12" height="40" rx="2" fill={T.silver3} opacity="0.5" />
            <line x1="4" y1="62" x2="76" y2="62" stroke={T.silver3} strokeWidth="1" opacity="0.3" />
          </svg>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.silver, marginBottom: 8 }}>选择区域以开始计算</div>
          <div style={{ color: T.silver2, fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
            选择一个区域后，系统将根据人口、基建数据和碳排模型，<br />自动计算基建补建方案与财务指标
          </div>
        </div>
      )}

      <Spin spinning={loading}>
        {selectedRegion && !data && !loading && (
          <div style={{ maxWidth: 420, margin: '100px auto', textAlign: 'center' }}>
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ marginBottom: 16, opacity: 0.4 }}>
              <rect x="2" y="2" width="76" height="76" rx="4" stroke={T.silver3} strokeWidth="1.5" />
              <rect x="10" y="10" width="60" height="16" rx="2" fill={T.silver3} opacity="0.3" />
              <rect x="10" y="32" width="45" height="10" rx="2" fill={T.silver3} opacity="0.25" />
              <rect x="10" y="48" width="35" height="10" rx="2" fill={T.silver3} opacity="0.2" />
              <rect x="10" y="64" width="25" height="10" rx="2" fill={T.silver3} opacity="0.15" />
            </svg>
            <div style={{ fontSize: 16, fontWeight: 600, color: T.silver, marginBottom: 8 }}>暂无基建数据</div>
            <div style={{ color: T.silver2, fontSize: 13, lineHeight: 1.6 }}>
              该区域暂无基建计算数据，请先录入基建合同
            </div>
          </div>
        )}
        {data && (
          <>
            {/* 统计卡片 - 暖色数字高亮 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6, marginBottom: 16 }}>
              {[
                { l: '人口', v: data.population.toLocaleString(), c: T.silver },
                { l: '基建数', v: data.total_current, c: T.accent },
                { l: '年收益', v: (data.total_revenue/10000).toFixed(0)+'万', c: T.green },
                { l: '维护费', v: (data.total_maintenance/10000).toFixed(0)+'万', c: T.warmGold },
                { l: '需投入', v: (data.total_build_cost/10000).toFixed(0)+'万', c: data.total_build_cost>0?T.red:T.green },
                { l: '净收益', v: ((data.total_revenue-data.total_maintenance)/10000).toFixed(0)+'万', c: (data.total_revenue-data.total_maintenance)>=0?T.green:T.red },
                { l: '碳排放', v: data.baseline_carbon, c: T.red },
                { l: '减排值', v: data.effective_carbon_reduction, c: T.green },
              ].map((k, i) => (
                <div key={i} style={{
                  background: T.card,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  padding: '8px 10px',
                }}>
                  <div style={{ fontSize: 11, color: T.silver3 }}>{k.l}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace", fontSize: 13, fontWeight: 600, color: k.c, marginTop: 2 }}>{k.v}</div>
                </div>
              ))}
            </div>

            {/* 表格 - 面板包裹 */}
            <div style={{
              background: T.panel,
              border: `1px solid ${T.border}`,
              borderRadius: 4,
            }}>
              <div className="section-title" style={{ padding: '10px 14px', margin: 0 }}>基建明细</div>
              <Table
                dataSource={data.items} rowKey="name" columns={columns}
                pagination={false} size="small" scroll={{ x: 1000 }} className="dense-table"
                rowClassName={(r) => r.gap > 0 ? 'row-need-build' : 'row-ok'}
              />
            </div>

            {/* 底栏 */}
            <div style={{
              marginTop: 8, padding: '8px 14px', borderRadius: 4,
              background: T.panel,
              border: `1px solid ${T.border}`,
              display: 'flex', justifyContent: 'space-between',
              fontSize: 11, color: T.silver3,
            }}>
              <span>建议 = 人口 × 建议比例  |  差额正 = 需新建</span>
              <span>
                需建 {data.items.filter(i => i.gap > 0).length} 项 ·
                总投资 <span style={{ color: T.warmGold, fontWeight: 600 }}>{(data.total_build_cost / 10000).toFixed(0)}万</span> ·
                减排值 <span style={{ color: T.green, fontWeight: 600 }}>{data.total_carbon_reduction}</span>
              </span>
            </div>
            <style>{`
              .row-need-build { background-color: rgba(239,68,68,0.05); }
              .row-ok { background-color: rgba(16,185,129,0.04); }
              .dense-table .ant-table-row:hover td {
                background-color: rgba(180,140,80,0.06) !important;
              }
            `}</style>
          </>
        )}
      </Spin>
    </div>
  )
}

export default InfraCalculator
