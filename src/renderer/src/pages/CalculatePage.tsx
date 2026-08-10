import React, { useEffect, useState } from 'react'
import { Form, InputNumber, Select, Button, Row, Col, Statistic, Skeleton, Table, message, Alert, Card } from 'antd'
import { CalculatorOutlined, ImportOutlined } from '@ant-design/icons'
import { api, formulaApi } from '../api/dashboard.api'
import { IPC_CHANNELS } from '../../../shared/constants'
import { invoke } from '../api/cloudApi'
import type { Region, FormulaInput, FormulaOutput, FormulaLog } from '../../../shared/types'
import { tokens as T } from '../styles/design-tokens'

const CalculatePage: React.FC = () => {
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<FormulaOutput | null>(null)
  const [logs, setLogs] = useState<FormulaLog[]>([])
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null)
  const [summary, setSummary] = useState<any>(null)
  const [form] = Form.useForm()

  useEffect(() => { api.region.list().then((d) => setRegions(d as Region[])) }, [])

  const loadLogs = async (regionId: number) => { setLogs(await formulaApi.logs(regionId) as FormulaLog[]) }

  const handleRegionChange = (value: number) => {
    setSelectedRegion(value); setResult(null); setSummary(null); loadLogs(value)
    const region = regions.find((r) => r.id === value)
    if (region) form.setFieldsValue({
      population: region.population, talent_population: region.talent_population,
      carbon_emissions: region.carbon_emissions, population_capacity: region.population_capacity,
      base_growth_rate: region.base_growth_rate,
    })
  }

  const handleImportFromContracts = async () => {
    if (!selectedRegion) return; setLoading(true)
    try {
      const s = await (invoke(IPC_CHANNELS.CONTRACT_SUMMARIZE, selectedRegion) as Promise<any>)
      setSummary(s)
      const region = regions.find((r) => r.id === selectedRegion)!
      form.setFieldsValue({
        population: s.total_population || region.population,
        talent_population: s.total_talent || region.talent_population,
        carbon_emissions: s.total_carbon || region.carbon_emissions,
        supply_quantity: s.total_supply, demand_quantity: s.sold_quantity,
        current_avg_price: s.avg_unit_price || 0,
        infra_population_delta: s.infra_population_delta,
        population_capacity: region.population_capacity, base_growth_rate: region.base_growth_rate,
      })
      message.success(`已导入：人口${s.total_population}、碳排放${s.total_carbon}`)
    } catch { message.error('导入失败') }
    finally { setLoading(false) }
  }

  const handleCalculate = async () => {
    if (!selectedRegion) return
    const values = await form.validateFields(); setLoading(true)
    try {
      const region = regions.find((r) => r.id === selectedRegion)!
      const input: FormulaInput = {
        region_id: selectedRegion, population: values.population || 0,
        talent_population: values.talent_population || 0, carbon_emissions: values.carbon_emissions || 0,
        supply_quantity: values.supply_quantity || 0, demand_quantity: values.demand_quantity || 0,
        prev_avg_price: values.prev_avg_price || 0, current_avg_price: values.current_avg_price || 0,
        base_cost: values.base_cost || 0, base_profit: values.base_profit || 0,
        infra_employment_bonuses: summary?.infra_bonuses || [],
        infra_population_delta: values.infra_population_delta || 0,
        population_capacity: values.population_capacity || region.population_capacity,
        base_growth_rate: values.base_growth_rate ?? region.base_growth_rate,
      }
      setResult(await formulaApi.calculate(input) as FormulaOutput)
      setRegions(await api.region.list() as Region[])
      if (selectedRegion) loadLogs(selectedRegion)
      message.success('模拟完成')
      try {
        const syncLog = await invoke(IPC_CHANNELS.STOCK_SYNC_LOG) as any
        if (syncLog?.lines?.length) {
          const last = syncLog.lines[syncLog.lines.length - 1]
          if (last.includes('✓')) message.info(`${last.slice(20)}`, 5)
        }
      } catch { /* stock sync not critical */ }
    } catch { message.error('计算失败') }
    finally { setLoading(false) }
  }

  // 面板样式 - 温暖专业派
  const darkPanel: React.CSSProperties = {
    background: T.panel,
    border: `1px solid ${T.border}`,
    borderRadius: 4,
    padding: '16px 18px',
    marginBottom: 16,
  }

  const stepHeader: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: T.silver2,
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  }

  // 嵌套卡片样式
  const nestedCardStyle: React.CSSProperties = {
    background: T.card,
    border: `1px solid ${T.border}`,
    marginBottom: 16,
  }
  const nestedCardHeader = {
    background: T.card,
    borderBottom: `1px solid ${T.border}`,
    minHeight: 32,
    padding: '6px 12px',
  }
  const nestedCardBody = { padding: '10px 12px' }

  return (
    <div>
      <div className="section-title" style={{ margin: 0, border: 'none', padding: 0, marginBottom: 16 }}>模拟计算</div>

      {loading ? (
        <>
          {/* Skeleton: 选择区域 */}
          <div style={darkPanel}>
            <div style={stepHeader}>选择区域</div>
            <Skeleton active title={false} paragraph={{ rows: 1, width: '60%' }} />
            <Skeleton.Button active size="small" style={{ width: 140, marginTop: 8 }} />
          </div>
          {/* Skeleton: 输入参数 */}
          <div style={darkPanel}>
            <div style={stepHeader}>输入参数</div>
            <Card size="small" title={<Skeleton.Button active size="small" style={{ width: 80, height: 16 }} />}
              style={nestedCardStyle} styles={{ header: nestedCardHeader, body: nestedCardBody }}>
              <Skeleton active title={false} paragraph={{ rows: 1 }} />
            </Card>
            <Card size="small" title={<Skeleton.Button active size="small" style={{ width: 80, height: 16 }} />}
              style={nestedCardStyle} styles={{ header: nestedCardHeader, body: nestedCardBody }}>
              <Skeleton active title={false} paragraph={{ rows: 1 }} />
            </Card>
            <Card size="small" title={<Skeleton.Button active size="small" style={{ width: 80, height: 16 }} />}
              style={nestedCardStyle} styles={{ header: nestedCardHeader, body: nestedCardBody }}>
              <Skeleton active title={false} paragraph={{ rows: 1 }} />
            </Card>
            <Skeleton.Button active size="small" block style={{ height: 32, marginTop: 10 }} />
          </div>
          {/* Skeleton: 显示结果 */}
          <div style={darkPanel}>
            <div style={stepHeader}>显示结果</div>
            <Row gutter={[8, 8]}>
              {[1,2,3,4,5,6].map(i => (
                <Col key={i} span={8}>
                  <Skeleton active title={{ width: '50%' }} paragraph={{ rows: 1, width: '70%' }} />
                </Col>
              ))}
            </Row>
          </div>
          {/* Skeleton: 历史记录 */}
          <div style={darkPanel}>
            <div style={stepHeader}>历史记录</div>
            <Skeleton active title={false} paragraph={{ rows: 3 }} />
          </div>
        </>
      ) : (
        <>
        {/* 选择区域 */}
        <div style={darkPanel}>
          <div style={stepHeader}>选择区域</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Select placeholder="选择区域" size="small" style={{ width: 260 }}
              value={selectedRegion} onChange={handleRegionChange}
              options={regions.map(r => ({ value: r.id, label: `${r.name} (${r.population.toLocaleString()}人)` }))} />
            <Button size="small" icon={<ImportOutlined />} onClick={handleImportFromContracts}
              disabled={!selectedRegion} loading={loading}>导入合同数据</Button>
          </div>
          {summary && (
            <Alert type="info" showIcon style={{ marginTop: 8, background: T.card, border: `1px solid ${T.border}` }}
              message={<span style={{ fontSize: 12 }}>劳动力 {summary.total_population}人 · 碳排 {summary.total_carbon.toFixed(1)} · 销量 {summary.sold_quantity}</span>} />
          )}
        </div>

        {/* 输入参数 */}
        <div style={darkPanel}>
          <div style={stepHeader}>输入参数</div>
          <Form form={form} layout="inline" size="small" className="compact-form">
            <Card size="small"
              title={<span style={{ fontSize: 12, fontWeight: 600, color: T.silver2 }}>基础条件</span>}
              style={nestedCardStyle} styles={{ header: nestedCardHeader, body: nestedCardBody }}>
              <Row gutter={[8, 8]} style={{ width: '100%' }}>
                <Col span={6}><Form.Item name="population" label="人口"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={6}><Form.Item name="talent_population" label="人才"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={6}><Form.Item name="carbon_emissions" label="碳排"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={6}><Form.Item name="infra_population_delta" label="基建新增"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
              </Row>
            </Card>
            <Card size="small"
              title={<span style={{ fontSize: 12, fontWeight: 600, color: T.silver2 }}>经济参数</span>}
              style={nestedCardStyle} styles={{ header: nestedCardHeader, body: nestedCardBody }}>
              <Row gutter={[8, 8]} style={{ width: '100%' }}>
                <Col span={6}><Form.Item name="supply_quantity" label="供应量"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={6}><Form.Item name="demand_quantity" label="需求量"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={6}><Form.Item name="prev_avg_price" label="上期均价"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={6}><Form.Item name="current_avg_price" label="本期均价"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={6}><Form.Item name="base_cost" label="成本"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={6}><Form.Item name="base_profit" label="利润"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
              </Row>
            </Card>
            <Card size="small"
              title={<span style={{ fontSize: 12, fontWeight: 600, color: T.silver2 }}>区域参数</span>}
              style={nestedCardStyle} styles={{ header: nestedCardHeader, body: nestedCardBody }}>
              <Row gutter={[8, 8]} style={{ width: '100%' }}>
                <Col span={6}><Form.Item name="population_capacity" label="承载力"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={6}><Form.Item name="base_growth_rate" label="增长率"><InputNumber style={{ width: '100%' }} step={0.01} /></Form.Item></Col>
              </Row>
            </Card>
          </Form>
          <Button type="primary" icon={<CalculatorOutlined />} onClick={handleCalculate}
            disabled={!selectedRegion} loading={loading} block style={{ marginTop: 10 }}>运行模拟</Button>
        </div>

        {/* 结果展示 */}
        <div style={darkPanel}>
          <div style={stepHeader}>显示结果</div>
          {result ? (
            <Row gutter={[8, 8]}>
              <Col span={8}><Statistic title="幸福度" value={result.happiness} suffix=" /100" precision={1}
                valueStyle={{ color: result.happiness > 60 ? T.green : T.red, fontSize: 18, fontFamily: "'JetBrains Mono', 'Consolas', monospace" }} /></Col>
              <Col span={8}><Statistic title="就业率" value={result.total_employment_rate} suffix="%" precision={2}
                valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono', 'Consolas', monospace", color: T.warmGold }} /></Col>
              <Col span={8}><Statistic title="成交价" value={result.sell_price} prefix="¥" precision={2}
                valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono', 'Consolas', monospace" }} /></Col>
              <Col span={8}><Statistic title="下期人口" value={Math.round(result.next_population)}
                valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono', 'Consolas', monospace" }} /></Col>
              <Col span={8}><Statistic title="基准价" value={result.base_price} prefix="¥" precision={2}
                valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono', 'Consolas', monospace" }} /></Col>
              <Col span={8}><Statistic title="满足度" value={result.consumer_satisfaction} precision={3}
                valueStyle={{ fontSize: 18, fontFamily: "'JetBrains Mono', 'Consolas', monospace", color: T.warmGold }} /></Col>
            </Row>
          ) : (
            <div style={{ textAlign: 'center', color: T.silver3, padding: '20px 0', fontSize: 12 }}>
              选择区域并运行模拟后查看结果
            </div>
          )}
        </div>

        {/* 历史记录 */}
        <div style={darkPanel}>
          <div style={stepHeader}>历史记录</div>
          <Table dataSource={logs} rowKey="id" size="small" pagination={{ pageSize: 4 }} className="dense-table"
            columns={[
              { title: '轮', dataIndex: 'round', width: 40 },
              { title: '幸福', dataIndex: 'output_happiness', width: 55, render: (v: number) => v.toFixed(1) },
              { title: '就业', dataIndex: 'output_employment_rate', width: 55, render: (v: number) => v.toFixed(2) },
              { title: '人口', dataIndex: 'output_population_next', width: 70, render: (v: number) => Math.round(v).toLocaleString() },
              { title: '价格', dataIndex: 'output_sell_price', width: 60, render: (v: number) => v.toFixed(2) },
              { title: '时间', dataIndex: 'calculated_at', width: 120, render: (v: string) => v?.slice(5, 16) },
            ]}
            locale={{ emptyText: <span style={{ color: T.silver3, fontSize: 11 }}>暂无记录</span> }}
          />
        </div>
        </>
      )}
    </div>
  )
}

export default CalculatePage
