import React, { useEffect, useState } from 'react'
import {
  Card, Form, InputNumber, Select, Button, Row, Col, Statistic, Divider,
  Typography, Spin, Table, message, Tag, Alert, Space
} from 'antd'
import { CalculatorOutlined, HistoryOutlined, ImportOutlined } from '@ant-design/icons'
import { api, formulaApi } from '../api/dashboard.api'
import type { Region, FormulaInput, FormulaOutput, FormulaLog } from '../../../shared/types'

const contractTypeNames: Record<number, string> = {
  2: '劳动力合同 → 人口/人才',
  3: '原料开采合同 → 碳排放',
  4: '销售合同 → 销量/均价',
  1: '基建合同 → 就业率/人口增量'
}

const CalculatePage: React.FC = () => {
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<FormulaOutput | null>(null)
  const [logs, setLogs] = useState<FormulaLog[]>([])
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null)
  const [summary, setSummary] = useState<any>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    api.region.list().then((d) => setRegions(d as Region[]))
  }, [])

  const loadLogs = async (regionId: number) => {
    const data = await formulaApi.logs(regionId)
    setLogs(data as FormulaLog[])
  }

  const handleRegionChange = (value: number) => {
    setSelectedRegion(value)
    setResult(null)
    setSummary(null)
    loadLogs(value)
    // 加载区域当前数据到表单
    const region = regions.find((r) => r.id === value)
    if (region) {
      form.setFieldsValue({
        population: region.population,
        talent_population: region.talent_population,
        carbon_emissions: region.carbon_emissions,
        population_capacity: region.population_capacity,
        base_growth_rate: region.base_growth_rate
      })
    }
  }

  const handleImportFromContracts = async () => {
    if (!selectedRegion) return
    setLoading(true)
    try {
      const s = await (window.api.invoke('contract:summarize', selectedRegion) as Promise<any>)
      setSummary(s)

      const region = regions.find((r) => r.id === selectedRegion)!

      // 自动填充表单
      form.setFieldsValue({
        population: s.total_population || region.population,
        talent_population: s.total_talent || region.talent_population,
        carbon_emissions: s.total_carbon || region.carbon_emissions,
        supply_quantity: s.total_supply,
        demand_quantity: s.sold_quantity,
        current_avg_price: s.avg_unit_price || 0,
        infra_population_delta: s.infra_population_delta,
        population_capacity: region.population_capacity,
        base_growth_rate: region.base_growth_rate
      })

      const totalInfraBonus = s.infra_bonuses.reduce((sum, b) => sum + b.bonus, 0)
      message.success(`已导入合同数据：人口${s.total_population}、碳排放${s.total_carbon}、基建加成${totalInfraBonus.toFixed(1)}`)
    } catch (err) {
      message.error('导入失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCalculate = async () => {
    if (!selectedRegion) return
    const values = await form.validateFields()
    setLoading(true)
    try {
      const region = regions.find((r) => r.id === selectedRegion)!

      // 构建基建加成列表
      const infraBonuses = summary?.infra_bonuses || []

      const input: FormulaInput = {
        region_id: selectedRegion,
        population: values.population || 0,
        talent_population: values.talent_population || 0,
        carbon_emissions: values.carbon_emissions || 0,
        supply_quantity: values.supply_quantity || 0,
        demand_quantity: values.demand_quantity || 0,
        prev_avg_price: values.prev_avg_price || 0,
        current_avg_price: values.current_avg_price || 0,
        base_cost: values.base_cost || 0,
        base_profit: values.base_profit || 0,
        infra_employment_bonuses: infraBonuses,
        infra_population_delta: values.infra_population_delta || 0,
        population_capacity: values.population_capacity || region.population_capacity,
        base_growth_rate: values.base_growth_rate ?? region.base_growth_rate
      }
      const output = await formulaApi.calculate(input)
      setResult(output as FormulaOutput)

      // 刷新区域数据和日志
      const updatedRegions = await api.region.list()
      setRegions(updatedRegions as Region[])
      if (selectedRegion) loadLogs(selectedRegion)
      message.success('模拟计算完成')
    } catch {
      message.error('计算失败')
    } finally {
      setLoading(false)
    }
  }

  const logColumns = [
    { title: '轮次', dataIndex: 'round', width: 50 },
    { title: '幸福度', dataIndex: 'output_happiness', width: 60, render: (v: number) => v.toFixed(1) },
    { title: '就业率(%)', dataIndex: 'output_employment_rate', width: 80, render: (v: number) => v.toFixed(2) },
    { title: '下期人口', dataIndex: 'output_population_next', width: 80, render: (v: number) => Math.round(v).toLocaleString() },
    { title: '成交价', dataIndex: 'output_sell_price', width: 60, render: (v: number) => v.toFixed(2) },
    { title: '计算时间', dataIndex: 'calculated_at', width: 140 }
  ]

  return (
    <div>
      <Typography.Title level={4}>模拟计算</Typography.Title>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          <strong>操作流程：</strong>
          ① 先录入合同（劳动力/原料/基建/销售）→ ② 选择区域 → ③ 点击"从合同导入" → ④ 点击"运行模拟"
        </Typography.Paragraph>
      </Card>
      <Row gutter={16}>
        <Col span={12}>
          <Card title="输入参数" size="small">
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item label="选择区域">
                  <Select
                    placeholder="选择区域"
                    value={selectedRegion}
                    onChange={handleRegionChange}
                    options={regions.map((r) => ({ value: r.id, label: `${r.name} (人口:${r.population.toLocaleString()})` }))}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Button
                  type="default"
                  icon={<ImportOutlined />}
                  onClick={handleImportFromContracts}
                  disabled={!selectedRegion}
                  loading={loading}
                  style={{ marginTop: 4 }}
                >
                  从合同导入数据
                </Button>
              </Col>
            </Row>

            {summary && (
              <Alert
                type="info"
                showIcon
                message="合同数据汇总"
                description={
                  <div style={{ fontSize: 12 }}>
                    <div>劳动力：{summary.total_population} 人（其中高素质 {summary.total_talent} 人）</div>
                    <div>碳排放：{summary.total_carbon.toFixed(1)} | 销量：{summary.sold_quantity} | 均价：{summary.avg_unit_price.toFixed(2)}</div>
                    <div>基建就业加成：{summary.infra_bonuses.reduce((s, b) => s + b.bonus, 0).toFixed(1)} | 基建人口增量：{summary.infra_population_delta.toFixed(0)}</div>
                  </div>
                }
                style={{ marginBottom: 12 }}
              />
            )}

            <Form form={form} layout="vertical" size="small">
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="population" label="人口(P)">
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="talent_population" label="高素质人才(T)">
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="carbon_emissions" label="碳排放(E)">
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="supply_quantity" label="供应量(Qs)">
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="demand_quantity" label="需求量(Qd)">
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="infra_population_delta" label="基建新增人口">
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={6}>
                  <Form.Item name="prev_avg_price" label="上期均价">
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="current_avg_price" label="本期均价">
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="base_cost" label="商品成本">
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item name="base_profit" label="基础利润">
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="population_capacity" label="承载力(k)">
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="base_growth_rate" label="基础增长率(r)">
                    <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} />
                  </Form.Item>
                </Col>
              </Row>
              <Button
                type="primary"
                icon={<CalculatorOutlined />}
                onClick={handleCalculate}
                loading={loading}
                disabled={!selectedRegion}
                block
                size="middle"
              >
                运行模拟
              </Button>
            </Form>
          </Card>
        </Col>

        <Col span={12}>
          {result && (
            <Card title="计算结果" size="small">
              <Row gutter={[12, 12]}>
                <Col span={8}><Statistic title="幸福度(H)" value={result.happiness} suffix="/100" precision={1}
                  valueStyle={{ color: result.happiness > 60 ? '#3f8600' : '#cf1322' }} /></Col>
                <Col span={8}><Statistic title="成交价" value={result.sell_price} prefix="¥" precision={2} /></Col>
                <Col span={8}><Statistic title="就业率" value={result.total_employment_rate} suffix="%" precision={2} /></Col>
                <Col span={8}><Statistic title="下期人口" value={Math.round(result.next_population)} /></Col>
                <Col span={8}><Statistic title="基准价" value={result.base_price} prefix="¥" precision={2} /></Col>
                <Col span={8}><Statistic title="消费者满足度" value={result.consumer_satisfaction} precision={3} /></Col>
              </Row>
              <Divider />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                中间变量：β={result.price_sensitivity.toFixed(4)} | 市场需求={result.market_demand.toFixed(0)} |
                基础就业率={result.base_employment_rate.toFixed(2)}% |
                基建就业加成={result.actual_infra_employment_bonus.toFixed(2)}%
              </Typography.Text>
            </Card>
          )}
          <Card title={<><HistoryOutlined /> 计算历史</>} size="small" style={{ marginTop: 16 }}>
            <Table
              dataSource={logs}
              rowKey="id"
              columns={logColumns}
              pagination={{ pageSize: 5 }}
              size="small"
              locale={{ emptyText: '暂无计算记录' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default CalculatePage
