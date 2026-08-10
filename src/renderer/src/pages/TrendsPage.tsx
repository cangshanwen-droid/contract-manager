import React, { useEffect, useState } from 'react'
import { tokens as T } from '../styles/design-tokens'
import { Select, Spin, Empty, Button } from 'antd'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/dashboard.api'
import type { Region, FormulaLog } from '../../../shared/types'

// ── Scientific data palette (Nature+Palantir) ──
// Qualitative: 3 perceptually uniform, red-green colorblind safe colors
// Sequential: single-hue blue gradient for quantitative data
const C = {
  blue:     '#5B9BD5',   // primary data series - Nature blue
  green:    '#70AD47',   // secondary - Nature green  
  seqBlue:  '#1565A9',   // sequential - dark blue (quantitative)
  orange:   '#ED7D31',   // tertiary - Nature orange
}

const TrendsPage: React.FC = () => {
  const [regions, setRegions] = useState<Region[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [logs, setLogs] = useState<FormulaLog[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.region.list().then((d) => setRegions(d as Region[]))
  }, [])

  const handleChange = async (value: number) => {
    setSelected(value); setLoading(true)
    try { setLogs(await api.formula.logs(value) as FormulaLog[]) }
    catch { setLogs([]) }
    finally { setLoading(false) }
  }

  const chartData = logs.map((l) => ({
    round: `第${l.round}轮`,
    happiness: Number(l.output_happiness.toFixed(1)),
    employment: Number(l.output_employment_rate.toFixed(2)),
    population: Math.round(l.output_population_next),
    sellPrice: Number(l.output_sell_price.toFixed(2)),
  }))

  const panel: React.CSSProperties = {
    background: '#111827', border: '1px solid #1a2740',
    borderRadius: 4, padding: '14px 18px',
  }

  // If no regions, prompt to create
  if (regions.length === 0) {
    return (
      <div style={{ maxWidth: 360, margin: '100px auto', textAlign: 'center' }}>
        <Empty description={<span style={{ color: '#7c8798' }}>暂无区域数据</span>}>
          <Button type="primary" onClick={() => navigate('/regions')}>创建区域</Button>
        </Empty>
      </div>
    )
  }

  // Selected but no logs yet
  const noLogsYet = selected && logs.length === 0 && !loading

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0, border: 'none', padding: 0 }}>趋势分析</div>
        <Select placeholder="选择区域" size="small" style={{ width: 200 }}
          value={selected} onChange={handleChange}
          options={regions.map((r) => ({ value: r.id, label: r.name }))} />
        {noLogsYet && (
          <Button size="small" type="link" onClick={() => navigate('/calculate')}
            style={{ color: '#1677FF' }}>
            先去运行模拟计算 →
          </Button>
        )}
      </div>

      <Spin spinning={loading}>
        {!selected ? (
          <div style={{ ...panel, textAlign: 'center', padding: '60px 0', color: '#7c8798', fontSize: 13 }}>
            选择一个区域查看趋势 · 数据来自模拟计算的历史记录
          </div>
        ) : noLogsYet ? (
          <div style={{ ...panel, textAlign: 'center', padding: '60px 0' }}>
            <Empty description={<span style={{ color: '#7c8798' }}>该区域暂无模拟记录</span>}>
              <Button type="primary" onClick={() => navigate('/calculate')}>运行模拟计算</Button>
            </Empty>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { title: '幸福度', key: 'happiness', color: C.blue, domain: [0, 100] as [number, number] },
              { title: '就业率', key: 'employment', color: C.green, domain: [0, 100] as [number, number] },
              { title: '人口', key: 'population', color: C.seqBlue, domain: [0, 'auto'] as [number, string] },
              { title: '成交价', key: 'sellPrice', color: C.orange, domain: [0, 'auto'] as [number, string] },
            ].map((c, i) => (
              <div key={i} style={panel}>
                <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 8, fontWeight: 500 }}>{c.title}</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="round" stroke="#7c8798" tick={{ fontSize: 11 }} />
                    <YAxis domain={c.domain} stroke="#7c8798" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#0f0f0f', border: '1px solid #1a2740', borderRadius: 4, color: T.textPrimary, fontSize: 12 }} />
                    <Line type="monotone" dataKey={c.key} stroke={c.color} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        )}
      </Spin>
    </div>
  )
}

export default TrendsPage
