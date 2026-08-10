import React, { useEffect, useState } from 'react'
import { Table, Empty } from 'antd'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip
} from 'recharts'
import { IPC_CHANNELS } from '../../../shared/constants'
import { invoke } from '../api/cloudApi'
import { tokens as T } from '../styles/design-tokens'

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
  const regionNames = [...new Set(detailData.map(d => d.region_name))]

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

  const barData = regionSummary.map(r => ({
    name: r.region_name,
    area: Number(r.total_land_area.toFixed(2))
  }))

  const sortedArea = [...detailData]
    .map(d => ({
      name: `${d.region_name}-${d.item_name}`,
      value: Number(d.total_land_area.toFixed(2))
    }))
    .sort((a, b) => b.value - a.value)

  const top8 = sortedArea.slice(0, 8)
  const othersValue = sortedArea.slice(8).reduce((s, d) => s + d.value, 0)
  const rankedBarData = othersValue > 0
    ? [...top8, { name: `其他 (${sortedArea.length - 8}项)`, value: Number(othersValue.toFixed(2)) }]
    : top8

  // 统计卡片 — 暖金左边框
  const statCard: React.CSSProperties = {
    background: T.card,
    border: `1px solid ${T.border}`,
    borderLeft: `3px solid ${T.warmGold}`,
    borderRadius: 4,
    padding: '10px 14px',
  }

  // 面板样式
  const darkPanel: React.CSSProperties = {
    background: T.panel,
    border: `1px solid ${T.border}`,
    borderRadius: 4,
    padding: '12px 14px',
  }

  // Tooltip 暖色样式
  const tooltipStyle: React.CSSProperties = {
    background: T.card,
    border: `1px solid ${T.warmGold}`,
    borderRadius: 4,
    color: T.silver,
    fontSize: 12,
  }

  return (
    <div>
      <div className="section-title" style={{ margin: 0, border: 'none', padding: 0, marginBottom: 16 }}>占地面积</div>
      {!loading && detailData.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div>
                <span style={{ color: T.silver, fontSize: 14, fontWeight: 500 }}>暂无土地面积数据</span>
                <br />
                <span style={{ color: T.silver3, fontSize: 12 }}>创建基建合同后将自动统计占地面积</span>
              </div>
            }
          />
        </div>
      ) : (
      <>
        {/* 顶部统计卡片 — 暖金边框 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 12 }}>
          <div style={statCard}>
            <div style={{ fontSize: 11, color: T.silver3 }}>总占地面积</div>
            <div style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace", fontSize: 18, fontWeight: 600, color: T.warmGold }}>{totalLandArea.toLocaleString()} ㎡</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: 11, color: T.silver3 }}>区域数</div>
            <div style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace", fontSize: 18, fontWeight: 600, color: T.silver }}>{regionNames.length}</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: 11, color: T.silver3 }}>类型数</div>
            <div style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace", fontSize: 18, fontWeight: 600, color: T.silver }}>{detailData.length}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
          {/* 左: 各区域占地面积对比 */}
          <div style={darkPanel}>
            <div className="section-title">各区域占地面积对比</div>
            {regionSummary.length === 0 ? (
              <div style={{ textAlign: 'center', color: T.silver3, padding: '40px 0', fontSize: 12 }}>暂无数据</div>
            ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2740" />
                <XAxis dataKey="name" stroke={T.silver3} tick={{ fontSize: 11 }} />
                <YAxis stroke={T.silver3} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="area" fill={T.accent} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>

          {/* 右: 占地面积排名 */}
          <div style={darkPanel}>
            <div className="section-title">占地面积排名 (Top 8)</div>
            {rankedBarData.length === 0 ? (
              <div style={{ textAlign: 'center', color: T.silver3, padding: '40px 0', fontSize: 12 }}>暂无数据</div>
            ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rankedBarData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2740" horizontal={false} />
                <XAxis type="number" stroke={T.silver3} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" stroke={T.silver3} tick={{ fontSize: 11 }} width={130} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => [`${v.toFixed(2)} ㎡`, '占地面积']}
                />
                <Bar dataKey="value" fill={T.accent} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ ...darkPanel, padding: 0 }}>
            <div className="section-title" style={{ padding: '10px 14px', margin: 0 }}>按区域汇总</div>
            <Table dataSource={regionSummary} rowKey="region_name" columns={regionColumns}
              pagination={false} size="small" loading={loading} className="dense-table"
              locale={{ emptyText: <span style={{ color: T.silver3, fontSize: 11 }}>暂无数据</span> }} />
          </div>
          <div style={{ ...darkPanel, padding: 0 }}>
            <div className="section-title" style={{ padding: '10px 14px', margin: 0 }}>按基建类型明细</div>
            <Table dataSource={detailData} rowKey={(r) => `${r.region_name}-${r.item_name}`}
              columns={detailColumns} pagination={false} size="small" loading={loading} className="dense-table"
              locale={{ emptyText: <span style={{ color: T.silver3, fontSize: 11 }}>暂无数据</span> }} />
          </div>
        </div>
      </>
      )}
    </div>
  )
}

export default LandAreaReport
