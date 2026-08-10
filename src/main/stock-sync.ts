/**
 * Gipfel ↔ 股票交易系统 联通模块 v3
 *
 * 模拟计算完成后自动同步区域经济指标到股票系统。
 * 映射规则（动态，不再硬编码）：
 *   区域 → 公司(region_id) → 股票(stock_symbol) → PATCH /admin/stocks/{symbol}
 *   幸福度 → premium_rate（上调股价）| 碳排 → carbon_price（下调股价）| 人口 → revenue
 *
 * 认证：X-Admin-Key（与云端 stock-api 的 _require_admin 一致）
 */

import { net, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { getDatabase } from './database/connection'
import { getAdminKey } from './credential-store'
import { CLOUD_API_BASE } from '../shared/cloud-config'

const STOCK_API = `${CLOUD_API_BASE}`
const MAX_LOG_LINES = 200

function logPath() { return path.join(app.getPath('userData'), 'stock-sync.log') }

function appendLog(line: string): void {
  try {
    const lines = (fs.existsSync(logPath()) ? fs.readFileSync(logPath(), 'utf-8').split('\n') : []).filter(Boolean)
    lines.push(`[${new Date().toISOString().slice(0, 19).replace('T', ' ')}] ${line}`)
    if (lines.length > MAX_LOG_LINES) lines.splice(0, lines.length - MAX_LOG_LINES)
    fs.writeFileSync(logPath(), lines.join('\n') + '\n', 'utf-8')
  } catch { /* */ }
}

export function readSyncLog(): string[] {
  try { return fs.existsSync(logPath()) ? fs.readFileSync(logPath(), 'utf-8').trim().split('\n').filter(Boolean) : [] }
  catch { return [] }
}

/**
 * 动态映射：从本地 companies 表读取 已上市(region_id + stock_symbol) 的公司，
 * 返回 区域名 → [股票代码]。
 */
export function getRegionStockMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  try {
    const db = getDatabase()
    const rows = db.exec(
      `SELECT c.region_id, c.stock_symbol, r.name AS region_name
       FROM companies c LEFT JOIN regions r ON c.region_id = r.id
       WHERE c.is_listed = 1 AND c.stock_symbol IS NOT NULL AND c.stock_symbol != ''`
    )
    if (rows.length > 0 && rows[0].values.length > 0) {
      const cols = rows[0].columns
      const ri = cols.indexOf('region_name')
      const si = cols.indexOf('stock_symbol')
      for (const v of rows[0].values) {
        const region = v[ri] || '未分区'
        const symbol = String(v[si]).toUpperCase()
        if (symbol && !(map[region] || []).includes(symbol)) {
          (map[region] = map[region] || []).push(symbol)
        }
      }
    }
  } catch { /* 数据库未就绪 */ }
  return map
}

interface StockUpdatePayload {
  premium_rate?: number
  carbon_price?: number
  revenue?: number
}

async function callStockAPI(symbol: string, payload: StockUpdatePayload): Promise<{ accepted: boolean; error?: string }> {
  try {
    // 管理端密钥：环境变量 GIPFEL_ADMIN_KEY → userData/admin-key.txt（绝不硬编码）
    const adminKey = getAdminKey()
    if (!adminKey) {
      appendLog('未配置管理端密钥（GIPFEL_ADMIN_KEY / admin-key.txt），跳过股票同步')
      return { accepted: false, error: '未配置管理端密钥' }
    }
    const res = await net.fetch(`${STOCK_API}/admin/stocks/${symbol.toUpperCase()}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
      body: JSON.stringify(payload),
    })
    const text = await res.text()
    if (!res.ok) return { accepted: false, error: `${res.status} ${text.slice(0, 80)}` }
    const data = JSON.parse(text)
    return { accepted: data.accepted === true }
  } catch (e: any) {
    return { accepted: false, error: e.message }
  }
}

export interface SyncContext {
  regionName: string
  happiness: number
  carbonEmissions: number
  population: number
  prevPopulation: number
}

export async function syncStockPrices(ctx: SyncContext): Promise<string[]> {
  const map = getRegionStockMap()
  // 若数据库无已上市公司，回退到通用映射（保证演示可用）
  const symbols = map[ctx.regionName] || (Object.keys(map).length === 0 ? fallbackSymbols(ctx.regionName) : [])
  if (!symbols || symbols.length === 0) {
    appendLog(`区域=${ctx.regionName} 无关联上市股票（可在公司管理中开启上市）`)
    return []
  }

  const cp = ctx.population > 0 ? ctx.carbonEmissions / ctx.population : 0
  const pc = ctx.prevPopulation > 0 ? (ctx.population - ctx.prevPopulation) / ctx.prevPopulation : 0

  // 模拟市场随机波动：基础值 ± 随机偏移，让股价不可完全预测
  const jitter = (base: number, pct: number) => Math.round(base * (1 + (Math.random() - 0.5) * 2 * pct))
  const premiumRate = jitter(Math.round(ctx.happiness), 0.05)       // 幸福度 ±5%
  const carbonPrice = Math.min(500, jitter(Math.round(cp * 10), 0.10)) // 碳排 ±10%

  const results: string[] = []
  appendLog(`区域=${ctx.regionName} 幸福=${ctx.happiness.toFixed(1)} 碳排=${ctx.carbonEmissions.toFixed(0)} 人口=${ctx.population.toLocaleString()} → 股票=[${symbols.join(',')}]`)

  for (const sym of symbols) {
    const p: StockUpdatePayload = { premium_rate: premiumRate, carbon_price: carbonPrice }
    if (Math.abs(pc) > 0.001) p.revenue = Math.round((1 + pc) * 100) / 100

    const r = await callStockAPI(sym, p)
    const line = `${r.accepted ? '✓' : '✗'} ${sym} premium=${premiumRate} carbon=${carbonPrice}` + (r.error ? ` (${r.error})` : '')
    results.push(line)
    appendLog(line)
  }

  return results
}

/** 无数据库上市数据时的回退映射（与 v2 一致，保证演示可跑） */
const FALLBACK_MAP: Record<string, string[]> = {
  A区: ['JGONG'],
  B区: ['JXIAO'],
  C区: ['WULIU', 'YLIAO'],
}
function fallbackSymbols(regionName: string): string[] {
  return FALLBACK_MAP[regionName] || []
}

/** 当前全部关联股票代码（用于设置页展示） */
export function getMappedSymbols(): string[] {
  return Array.from(new Set(Object.values(getRegionStockMap()).flat().concat(Object.values(FALLBACK_MAP).flat())))
}
