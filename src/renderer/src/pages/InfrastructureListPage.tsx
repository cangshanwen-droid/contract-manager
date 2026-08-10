import React, { useEffect, useState } from 'react'
import { Table, Typography, Tag, Empty } from 'antd'
import { api } from '../api/dashboard.api'
import type { InfrastructureType } from '../../../shared/types'
import { formatMoney, formatPercent } from '../utils/format'
import { tokens as T } from '../styles/design-tokens'

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
      render: (v: string) => <Tag color={v === '民生配套' ? 'blue' : 'default'}>{v}</Tag>
    },
    {
      title: '基建名称', dataIndex: 'name', width: 120,
      render: (v: string) => <span style={{ fontWeight: 500, color: T.silver }}>{v}</span>
    },
    { title: '单价', dataIndex: 'price', width: 80, render: (v: number) => <span style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace" }}>{formatMoney(v)}</span> },
    { title: '占地面积', dataIndex: 'default_land_area', width: 70, render: (v: number) => <span style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace" }}>{v?.toLocaleString()}</span> },
    { title: '就业加成', dataIndex: 'population_addition', width: 70, render: (v: number) => v || '-' },
    { title: '引才', dataIndex: 'talent_addition', width: 50, render: (v: number) => v > 0 ? <span style={{color: T.warmGold}}>{v}</span> : '-' },
    { title: '年减排(吨)', dataIndex: 'carbon_reduction', width: 80, render: (v: number) => v > 0 ? <span style={{color: T.green}}>{v}</span> : '-' },
    {
      title: '幸福指数', dataIndex: 'happiness_index', width: 70,
      render: (v: number) => v ? <span style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace" }}>{v.toFixed(1)}</span> : '-'
    },
    { title: '收益指数', dataIndex: 'revenue_index', width: 70, render: (v: number) => <span style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace" }}>{v}</span> },
    { title: '建议比例', dataIndex: 'recommended_ratio', width: 70, render: (v: number) => <span style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace", color: T.warmGold }}>{formatPercent(v)}</span> },
  ]

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16, color: T.silver }}>基建类型字典</Typography.Title>
      {/* 表格 — 面板包裹 + 暖色标尺 */}
      <div style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 4,
      }}>
        <Table
          dataSource={data}
          rowKey="id"
          columns={columns}
          pagination={false}
          size="small"
          loading={loading}
          className="dense-table"
          rowClassName={(_r, idx) => idx % 2 === 0 ? 'row-even-warm' : 'row-odd'}
          locale={{ emptyText:
            <div style={{ padding: '24px 0' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div>
                    <span style={{ color: T.silver, fontSize: 14, fontWeight: 500 }}>
                      暂无基建类型数据
                    </span>
                    <br />
                    <span style={{ color: T.silver3, fontSize: 12 }}>
                      系统预设基建类型字典
                    </span>
                  </div>
                }
              />
            </div>
          }}
        />
      </div>

      {/* 暖色行标尺 */}
      <style>{`
        .row-even-warm td { background-color: rgba(180,140,80,0.03) !important; }
        .row-odd td { background-color: transparent !important; }
        .dense-table .ant-table-row:hover td {
          background-color: rgba(180,140,80,0.06) !important;
        }
      `}</style>
    </div>
  )
}

export default InfrastructureListPage
