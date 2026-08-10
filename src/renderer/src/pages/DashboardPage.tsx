/**
 * DashboardPage - 合同管理 + 区域模拟驾驶舱
 * ─────────────────────────────────────────────
 * Layout (3 sections, top→bottom):
 *   1. 核心 KPI 行 - 区域数/合同数/公司数/碳排放
 *   2. 区域网格 - 4 张区域卡片（人口/幸福度/就业率/碳排）
 *   3. 图表行 - 人口趋势折线 | 合同状态分布柱状 | 最近活动列表
 *
 * Tokens: 基础暗色色板
 *   品牌蓝 #1677FF 用于核心 KPI 数字和图表
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Empty, Skeleton, Button, Tag, message } from 'antd'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts'
import { IPC_CHANNELS } from '../../../shared/constants'
import { useNavigate } from 'react-router-dom'
import { invoke } from '../api/cloudApi'
import { usePolling } from '../hooks/usePolling'
import { useAuth } from '../context/AuthContext'
import { tokens as T } from '../styles/design-tokens'
import { formatMoneyCNY, formatPercentWithSign, formatTrend, POSITIVE_COLOR, NEGATIVE_COLOR } from '../utils/format'

// ── 区域-股票联动映射 (与 stock-sync.ts 保持一致) ──
const REGION_STOCK: Record<string, string[]> = {
  'A区': ['JGONG'],
  'B区': ['JXIAO'],
  'C区': ['WULIU', 'YLIAO'],
}

// ═══════════════════════════════════════════════════════════════
// Status helpers
// ═══════════════════════════════════════════════════════════════

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', active: '执行中', completed: '已完成',
  terminated: '已终止', expired: '已过期',
}

const STATUS_COLORS: Record<string, string> = {
  draft: T.silverMut, active: T.blue, completed: T.green,
  terminated: T.red, expired: T.warmGold,
}


// ═══════════════════════════════════════════════════════════════
// DashboardPage
// ═══════════════════════════════════════════════════════════════

const DashboardPage: React.FC = () => {
  const user = useAuth()
  const [data, setData] = useState<any>(null)
  const [regions, setRegions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [hints, setHints] = useState<any[]>([])
  const [systemStats, setSystemStats] = useState<any>(null)
  const navigate = useNavigate()

  // ── 股票实时价格 ──
  const [stockQuotes, setStockQuotes] = useState<Record<string, {price:number, change:number, changePct:number}>>({})
  // 行情获取失败标记：失败时区域卡片显示「行情暂不可用」降级提示，而非静默隐藏
  const [quoteFailed, setQuoteFailed] = useState(false)

  const loadStockData = useCallback(async (): Promise<boolean> => {
    try {
      const result = await invoke(IPC_CHANNELS.STOCK_GET_MARKET)
      if (result?.success && result.data?.stocks) {
        const quotes: Record<string, any> = {}
        for (const s of result.data.stocks) {
          quotes[s.symbol] = { price: s.price, change: s.change, changePct: s.changePct }
        }
        setStockQuotes(quotes)
        setQuoteFailed(false)
        return true
      }
      setQuoteFailed(true)
      return false
    } catch {
      setQuoteFailed(true)
      return false
    }
  }, [])

  // P0-2 修复：30s 轮询行情 — in-flight 守卫 + 失败指数退避（30s→60s→5m，恢复后重置）
  usePolling(loadStockData, 30000)

  // ── admin: 加载系统概览统计 ──
  useEffect(() => {
    if (user?.role !== 'admin') return
    ;(async () => {
      try {
        const result = await invoke(IPC_CHANNELS.DASHBOARD_SYSTEM_STATS) as any
        if (result?.success) setSystemStats(result.stats)
      } catch {}
    })()
  }, [user?.role])

  // ── rep: 加载已上市公司列表（本公司信息 / 已上市股票数） ──
  const [repListedCompanies, setRepListedCompanies] = useState<any[]>([])
  useEffect(() => {
    if (user?.role !== 'rep') return
    ;(async () => {
      try {
        const res = await invoke(IPC_CHANNELS.COMPANY_LIST) as any
        const list = Array.isArray(res) ? res : (res?.data || [])
        setRepListedCompanies(list.filter((c: any) => c.is_listed))
      } catch {}
    })()
  }, [user?.role])

  useEffect(() => {
    (async () => {
      try {
        // P1-1：Dashboard 不再拉 CONTRACT_LIST 全表——
        // 合同状态分布/待审批计数/最近活动由 dashboard:summary 扩展字段一次返回（GROUP BY status + 最近 6 条）
        const [s, r, h] = await Promise.all([
          invoke(IPC_CHANNELS.DASHBOARD_SUMMARY) as Promise<any>,
          invoke(IPC_CHANNELS.REGION_LIST) as Promise<any[]>,
          invoke(IPC_CHANNELS.ANNOUNCEMENT_ACTIVE_LIST) as Promise<any[]>,
        ])
        setData(s)
        setRegions(r || [])
        setHints(h || [])
      } catch {
        message.error('加载仪表盘数据失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // ════════════════════════════════════════
  // Derived metrics
  // ════════════════════════════════════════

  const regionCount = data?.total_regions ?? 0
  const contractCount = data?.total_contracts ?? 0
  const companyCount = data?.total_companies ?? 0
  const totalCarbon = regions.reduce((s, r) => s + (r.carbon_emissions || 0), 0)
  const totalPopulation = regions.reduce((s, r) => s + (r.population || 0), 0)
  const totalContractAmount = data?.total_contract_amount ?? 0
  const totalAccountBalance = data?.total_account_balance ?? 0
  const totalAccounts = data?.total_accounts ?? 0

  // ── Carbon display format ──
  const formatCarbon = (v: number): string => {
    if (v >= 10000) return `${(v / 10000).toFixed(1)} 万`
    if (v >= 1000) return `${(v / 1000).toFixed(1)} 千`
    return `${v.toFixed(0)}`
  }

  // ── Population display format ──
  const formatPopulation = (v: number): string => {
    if (v >= 10000) return `${(v / 10000).toFixed(1)} 万`
    if (v >= 1000) return `${(v / 1000).toFixed(1)} 千`
    return v.toLocaleString()
  }

  // ── KPI values ──
  // Must be called before any early return (React hooks ordering rule)
  const animRegionCount = regionCount
  const animContractCount = contractCount
  const animCompanyCount = companyCount

  // ── Loading ──
  if (loading)
    return (
      <div className="page-fade-in" style={{ maxWidth: 1440, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.accent}`, borderRadius: 4, padding: '16px 20px' }}>
              <Skeleton.Input active size="small" style={{ width: 60, marginBottom: 8 }} />
              <Skeleton.Input active style={{ width: 100, height: 24 }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4, padding: '24px 20px' }}>
              <Skeleton active paragraph={{ rows: 3 }} />
            </div>
          ))}
        </div>
      </div>
    )

  const hasData = regionCount + contractCount > 0

  // ── Empty state ──
  if (!hasData) {
    const isRep = user?.role === 'rep'
    return (
      <div className="page-fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary, marginBottom: 8, lineHeight: 1.2 }}>
                暂无数据
              </div>
              <div style={{ color: T.textMuted, fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
                {isRep ? '当前为只读视图，区域与合同数据由操作端创建后同步展示' : '请先创建区域和合同'}
              </div>
              {isRep ? (
                <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>
                  如需新增数据，请联系操作端或管理端
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <Button type="primary" size="small" onClick={() => navigate('/regions')}>
                    创建区域
                  </Button>
                  <Button size="small" onClick={() => navigate('/contracts')}>
                    创建合同
                  </Button>
                </div>
              )}
            </div>
          }
        />
      </div>
    )
  }

  // ════════════════════════════════════════
  // Section 2: Region cards data
  // ════════════════════════════════════════

  const displayRegions = regions.length > 0
    ? regions.slice(0, 4)
    : placeholderRegions

  // ════════════════════════════════════════
  // Section 3: Chart data
  // ════════════════════════════════════════

  // Population trend - sorted regions
  const popChartData = [...regions]
    .sort((a, b) => (b.population || 0) - (a.population || 0))
    .map((r) => ({
      name: r.name.length > 3 ? r.name.slice(0, 3) : r.name,
      fullName: r.name,
      population: r.population || 0,
    }))

  // Contract status distribution（P1-1：来自 dashboard:summary 扩展，不再遍历全表）
  const statusCounts: Record<string, number> = (data?.contract_status_counts as Record<string, number>) || {}
  const contractStatusData = Object.entries(statusCounts).map(([status, count]) => ({
    status: STATUS_LABELS[status] || status,
    count,
  }))

  // Recent activity - latest 6 contracts（P1-1：summary 扩展字段）
  const recentContracts = (data?.recent_contracts || []) as any[]

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="page-fade-in" style={{ maxWidth: 1440, margin: '0 auto' }}>

      {/* ════════════ REP: 欢迎语 + 代表端数据概览 ════════════ */}
      {user?.role === 'rep' && (
        <div style={{
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4,
          marginBottom: 24, padding: '18px 22px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: T.silver, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 6 }}>
              欢迎回来，{user.username || '代表'}
            </div>
            <div style={{ fontSize: 12, color: T.silverMut, lineHeight: 1.6 }}>
              代表端只读视图 · 可查看本公司信息、合同与资金概况，如需操作请联系操作端
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <RepMiniStat label="本公司" value={repListedCompanies.length > 0 ? repListedCompanies[0].name : '-'} />
            <RepMiniStat label="已上市股票数" value={repListedCompanies.filter((c: any) => c.stock_symbol).length} />
            <RepMiniStat label="公司总数" value={companyCount} />
          </div>
        </div>
      )}

      {/* ════════════ SECTION 1: 核心 KPI 卡片行 ════════════ */}
      <div className="kpi-grid-4" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16,
        marginBottom: 24,
      }}>
        <KPICard label="区域数" value={animRegionCount} />
        <KPICard label="合同数" value={animContractCount} />
        <KPICard label="公司数" value={animCompanyCount} />
        <KPICard label="碳排放总量" value={formatCarbon(totalCarbon)} />
      </div>

      {/* ════════════ SECTION 1b: 财务 KPI ════════════ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16,
        marginBottom: 16,
      }}>
        <KPICard label="合同总额" value={formatMoneyCNY(totalContractAmount)} />
        <KPICard label="资金余额" value={formatMoneyCNY(totalAccountBalance)} />
        <KPICard label="账户数" value={totalAccounts} />
        <KPICard label="总人口" value={formatPopulation(totalPopulation)} />
      </div>

      {/* ════════════ ADMIN: 系统概览 ════════════ */}
      {user?.role === 'admin' && (
        <div className="gipfel-card" style={{
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4,
          marginBottom: 16, padding: '16px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
              系统概览
            </span>
            <Tag color="gold" style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}>管理端</Tag>
            <span style={{ fontSize: 11, color: T.silverMut }}>
              用户构成 · 活跃度 · 最近创建用户
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16 }}>
            {/* 左：用户构成 KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, alignContent: 'start' }}>
              <KPICard label="系统用户总数" value={systemStats?.total_users ?? 0} />
              <KPICard label="操作员数" value={systemStats?.operator_count ?? 0} />
              <KPICard label="代表数" value={systemStats?.rep_count ?? 0} />
              <KPICard label="管理员数" value={systemStats?.admin_count ?? 0} />
              <KPICard label="活跃用户（30天）" value={systemStats?.active_users_30d ?? 0} />
              <KPICard label="今日登录" value={systemStats?.logins_24h ?? 0} />
            </div>

            {/* 右：最近创建用户 */}
            <div style={{
              borderLeft: `1px solid ${T.border}`, paddingLeft: 16, minWidth: 0,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.silverSec, marginBottom: 8, lineHeight: 1.2 }}>
                最近创建用户
              </div>
              {(systemStats?.recent_users ?? []).length === 0 ? (
                <div style={{ fontSize: 11, color: T.silverMut, padding: '12px 0' }}>暂无用户</div>
              ) : (
                systemStats.recent_users.map((u: any, i: number) => (
                  <div key={u.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 0',
                    borderBottom: i < systemStats.recent_users.length - 1 ? `1px solid ${T.border}` : 'none',
                    lineHeight: 1.4,
                  }}>
                    <span style={{
                      fontSize: 12, fontWeight: 500, color: T.silver,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0,
                    }}>
                      {u.username}
                    </span>
                    <Tag color={u.role === 'admin' ? 'gold' : u.role === 'operator' ? 'blue' : 'green'}
                      style={{ fontSize: 11, lineHeight: '16px', margin: 0, flexShrink: 0 }}>
                      {u.role === 'admin' ? '管理员' : u.role === 'operator' ? '操作员' : '代表'}
                    </Tag>
                    <span style={{
                      marginLeft: 'auto', fontSize: 11, color: T.silverMut, flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {u.created_at?.slice(0, 16) || '-'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════ OPERATOR: 待办工作台 ════════════ */}
      {user?.role === 'operator' && (
        <div style={{
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4,
          marginBottom: 16, padding: '16px 20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, lineHeight: 1.2 }}>
              待办工作台
            </div>
            <span
              onClick={() => navigate('/contracts')}
              style={{ fontSize: 12, color: T.accent, cursor: 'pointer', lineHeight: 1.2 }}
              onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'underline' }}
              onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'none' }}
            >
              查看全部合同 →
            </span>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <TodoCard
              label="待审批合同"
              count={data?.contract_approval_pending ?? 0}
              color={T.warning}
              onClick={() => navigate('/contracts?status=pending')}
            />
            <TodoCard
              label="执行中合同"
              count={statusCounts['active'] || 0}
              color={T.blue}
              onClick={() => navigate('/contracts?status=active')}
            />
            <TodoCard
              label="已过期合同"
              count={statusCounts['expired'] || 0}
              color={T.red}
              onClick={() => navigate('/contracts?status=expired')}
            />
          </div>
        </div>
      )}

      {/* ════════════ SECTION 2: 公告栏 ════════════ */}
      {hints.length > 0 && (
        <div style={{
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4,
          marginBottom: 16, padding: '12px 16px', maxHeight: 180, overflowY: 'auto'
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.textSecondary, marginBottom: 8 }}>
            最新公告
          </div>
          {hints.slice(0, 5).map((h: any) => (
            <div key={h.id} style={{
              padding: '6px 0', borderBottom: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'
            }}>
              <span style={{ fontSize: 11, color: h.priority === 'high' ? T.red : T.accent, fontWeight: 600 }}>
                {h.priority === 'high' ? '●' : '○'}
              </span>
              <span style={{ fontSize: 12, color: T.textPrimary, flex: 1 }}>{h.title}</span>
              <span style={{ fontSize: 11, color: T.textMuted }}>{h.region_name || '全局'}</span>
            </div>
          ))}
        </div>
      )}

      {/* ════════════ SECTION 3: 区域网格 ════════════ */}
      <div className="region-grid-4" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16,
        marginBottom: 24,
      }}>
        {displayRegions.map((r: any, i: number) => (
          <RegionInfoCard
            key={r.id || `ph-${i}`}
            region={r}
            isPlaceholder={regions.length === 0 || i >= regions.length}
            stockQuotes={stockQuotes}
            quoteFailed={quoteFailed}
            clickable={user?.role !== 'rep'}
            onClick={() => { if (user?.role !== 'rep') navigate('/regions') }}
          />
        ))}
      </div>

      {/* ════════════ SECTION 3: 图表行 ════════════ */}
      <div className="chart-grid-3" style={{
        display: 'grid',
        gridTemplateColumns: '1.618fr 1fr 1fr',
        gap: 16,
      }}>
        {/* 人口趋势折线图 */}
        <ChartPanel title="人口趋势">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={popChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke={T.border} strokeOpacity={0.5} />
              <XAxis
                dataKey="name"
                stroke={T.silverMut}
                tick={{ fontSize: 11, fill: T.silverMut }}
                axisLine={{ stroke: T.border }}
                tickLine={false}
              />
              <YAxis
                stroke={T.silverMut}
                tick={{ fontSize: 11, fill: T.silverMut }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v >= 10000 ? `${(v / 10000).toFixed(0)} 万` : v}
              />
              <Tooltip
                contentStyle={{
                  background: T.bgElevated,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  color: T.silver,
                  fontSize: 12,
                }}
                labelFormatter={(label, payload) => {
                  const entry = payload?.[0]?.payload
                  return entry?.fullName || label
                }}
                formatter={(value: number) => [formatPopulation(value), '人口']}
              />
              <Line
                type="monotone"
                dataKey="population"
                stroke={T.blue}
                strokeWidth={2}
                dot={{ r: 3, fill: T.blue, stroke: T.bgCard, strokeWidth: 1.5 }}
                activeDot={{ r: 5, fill: T.blue, stroke: T.bgCard, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        {/* 合同状态分布柱状图 */}
        <ChartPanel title="合同状态分布">
          {contractStatusData.length === 0 ? (
            <div style={{ color: T.silverMut, fontSize: 12, padding: '40px 0', textAlign: 'center' }}>
              暂无合同数据
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={contractStatusData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke={T.border} strokeOpacity={0.5} />
                <XAxis
                  dataKey="status"
                  stroke={T.silverMut}
                  tick={{ fontSize: 11, fill: T.silverMut }}
                  axisLine={{ stroke: T.border }}
                  tickLine={false}
                />
                <YAxis
                  stroke={T.silverMut}
                  tick={{ fontSize: 11, fill: T.silverMut }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: T.bgElevated,
                    border: `1px solid ${T.border}`,
                    borderRadius: 4,
                    color: T.silver,
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [value, '合同数量']}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48} fill={T.blue} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartPanel>

        {/* 最近活动列表 */}
        <ChartPanel title="最近活动">
          <div style={{ maxHeight: 280, overflow: 'auto' }}>
            {recentContracts.length === 0 ? (
              <div style={{ color: T.silverMut, fontSize: 12, padding: '32px 0', textAlign: 'center' }}>
                暂无合同记录
              </div>
            ) : (
              recentContracts.map((c, i) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 0',
                    borderBottom: i < recentContracts.length - 1 ? `1px solid ${T.border}` : 'none',
                    lineHeight: 1.6,
                    cursor: 'pointer',
                  }}
                  onClick={() => navigate('/contracts')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, color: T.silver, fontWeight: 500,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {c.contract_name || c.contract_no || `合同 #${c.id}`}
                    </div>
                    <div style={{ fontSize: 11, color: T.silverMut }}>
                      {c.contract_no || ''}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: STATUS_COLORS[c.status] || T.silverMut,
                    background: `${STATUS_COLORS[c.status] || T.silverMut}18`,
                    padding: '2px 8px', borderRadius: 3, flexShrink: 0, marginLeft: 12,
                  }}>
                    {STATUS_LABELS[c.status] || c.status || '未知'}
                  </span>
                </div>
              ))
            )}
          </div>
        </ChartPanel>
      </div>

    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════

/** KPI card - left 3px accent border + large number + small label */
const KPICard: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div className="gipfel-card" style={{
    background: T.bgCard,
    border: `1px solid ${T.border}`,
    borderLeft: `3px solid ${T.accent}`,
    borderRadius: 4,
    padding: '16px 20px',
  }}>
    <div style={{ fontSize: 11, color: T.silverMut, marginBottom: 8, lineHeight: 1.6 }}>
      {label}
    </div>
    <div style={{
      fontFamily: "'Inter', 'SF Pro Display', 'JetBrains Mono', 'Consolas', monospace",
      fontSize: 24,
      fontWeight: 600,
      color: T.silver,
      fontVariantNumeric: 'tabular-nums',
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
    }}>
      {typeof value === 'number' ? value.toLocaleString() : value}
    </div>
  </div>
)

/** 代表端迷你统计 - 欢迎语右侧紧凑指标 */
const RepMiniStat: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div style={{
    background: T.bgPanel,
    border: `1px solid ${T.border}`,
    borderRadius: 4,
    padding: '10px 16px',
    minWidth: 110,
  }}>
    <div style={{ fontSize: 11, color: T.silverMut, marginBottom: 4, lineHeight: 1.6 }}>
      {label}
    </div>
    <div style={{
      fontFamily: "'Inter', 'SF Pro Display', 'JetBrains Mono', monospace",
      fontSize: 18,
      fontWeight: 600,
      color: T.silver,
      fontVariantNumeric: 'tabular-nums',
      lineHeight: 1.2,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}>
      {typeof value === 'number' ? value.toLocaleString() : value}
    </div>
  </div>
)

/** 待办工作台卡片 - 可点击跳转到合同列表对应筛选 */
const TodoCard: React.FC<{ label: string; count: number; color: string; onClick: () => void }> = ({ label, count, color, onClick }) => (
  <div
    onClick={onClick}
    style={{
      flex: 1, background: `${color}14`, borderRadius: 4,
      padding: '12px 16px', borderLeft: `3px solid ${color}`,
      cursor: 'pointer', transition: 'background 150ms ease', position: 'relative',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${color}26` }}
    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = `${color}14` }}
  >
    <div style={{ fontSize: 24, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums',
      fontFamily: "'Inter', 'SF Pro Display', 'JetBrains Mono', monospace", lineHeight: 1.2 }}>
      {count}
    </div>
    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{label}</div>
    <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 11, color, opacity: 0.75 }}>→</div>
  </div>
)

/** Region info card for Section 2 */
const RegionInfoCard: React.FC<{
  region: any
  isPlaceholder: boolean
  clickable?: boolean
  onClick: () => void
  stockQuotes: Record<string, {price:number, change:number, changePct:number}>
  quoteFailed: boolean
}> = ({ region, isPlaceholder, clickable = true, onClick, stockQuotes, quoteFailed }) => {
  const happiness = region.current_happiness != null
    ? region.current_happiness.toFixed(1)
    : '--'
  const employment = region.current_employment_rate != null
    ? `${region.current_employment_rate.toFixed(1)}%`
    : '--'
  const population = region.population != null
    ? region.population >= 10000
      ? `${(region.population / 10000).toFixed(1)} 万`
      : region.population.toLocaleString()
    : '--'
  const carbon = region.carbon_emissions != null
    ? region.carbon_emissions >= 1000
      ? `${(region.carbon_emissions / 1000).toFixed(1)} K`
      : `${region.carbon_emissions}`
    : '--'

  return (
    <div
          className="gipfel-card"
          onClick={onClick}
          style={{
            background: T.bgCard,
            border: isPlaceholder ? `1px dashed ${T.border}` : `1px solid ${T.border}`,
            borderRadius: 4,
            padding: '18px 20px',
            cursor: !isPlaceholder && clickable ? 'pointer' : 'default',
            display: 'flex', flexDirection: 'column', gap: 10,
            opacity: isPlaceholder ? 0.5 : 1,
          }}
    >
      {/* Region name */}
      <div style={{ fontSize: 14, fontWeight: 600, color: T.silver, lineHeight: 1.2, letterSpacing: 'normal' }}>
        {region.name || '新建区域'}
      </div>

      {/* Data rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <RowItem label="人口" value={population} />
        <RowItem label="幸福度" value={happiness} />
        <RowItem label="就业率" value={employment} />
        <RowItem label="碳排" value={carbon} />
      </div>

      {/* 股票实时价格 */}
      {REGION_STOCK[region.name]?.map((sym: string) => {
        const q = stockQuotes[sym]
        return (
          <div key={sym} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '4px 0', borderTop: `1px solid ${T.border}`, marginTop: 4, fontSize: 12,
          }}>
            <span style={{ color: T.silverMut }}>{sym}</span>
            {q ? (
              <span style={{ fontFamily: 'tabular-nums' }}>
                <span style={{ color: T.silver }}>{formatMoneyCNY(q.price)}</span>
                <span style={{ color: q.change >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR, marginLeft: 8 }}>
                  {formatTrend(q.changePct)}{formatPercentWithSign(q.changePct)}
                </span>
              </span>
            ) : (
              <span style={{ fontSize: 11, color: T.silverMut }}>
                {quoteFailed ? '行情暂不可用' : '-'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Single data row in region card */
const RowItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', lineHeight: 1.6 }}>
    <span style={{ fontSize: 11, color: T.silverMut }}>{label}</span>
    <span style={{
      fontSize: 12,
      fontWeight: 600,
      color: T.silver,
      fontFamily: "'Inter', 'SF Pro Display', 'JetBrains Mono', monospace",
      fontVariantNumeric: 'tabular-nums',
    }}>
      {value}
    </span>
  </div>
)

/** Chart panel wrapper */
const ChartPanel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="gipfel-card" style={{
    background: T.bgCard,
    border: `1px solid ${T.border}`,
    borderRadius: 4,
    padding: '16px 18px',
  }}>
    <div style={{
      fontSize: 13,
      fontWeight: 600,
      color: T.silver,
      marginBottom: 12,
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
    }}>
      {title}
    </div>
    {children}
  </div>
)

/** Placeholder regions when no data */
const placeholderRegions = [
  { id: -1, name: '区域一', population: null, current_happiness: null, current_employment_rate: null, carbon_emissions: null },
  { id: -2, name: '区域二', population: null, current_happiness: null, current_employment_rate: null, carbon_emissions: null },
  { id: -3, name: '区域三', population: null, current_happiness: null, current_employment_rate: null, carbon_emissions: null },
  { id: -4, name: '区域四', population: null, current_happiness: null, current_employment_rate: null, carbon_emissions: null },
]

// ── Button styles ──
const btnPrimaryT: React.CSSProperties = {
  display: 'inline-block',
  padding: '8px 24px',
  background: T.blue,
  border: `1px solid ${T.blue}`,
  color: '#fff',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.5,
}

const btnSecondaryT: React.CSSProperties = {
  display: 'inline-block',
  padding: '8px 24px',
  background: 'transparent',
  border: `1px solid ${T.border}`,
  color: T.silver,
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.5,
}

export default DashboardPage
