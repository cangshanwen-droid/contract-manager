/**
 * 区域→股票 动态映射单测（getRegionStockMap）
 * 依赖注入：真实 sql.js 内存库 + mock getDatabase 抛错分支
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupTestDb } from './helpers/setup'
import { getDatabase } from '../src/main/database/connection'
import * as connectionModule from '../src/main/database/connection'
import { getMappedSymbols, getRegionStockMap } from '../src/main/stock-sync'

beforeEach(async () => {
  vi.restoreAllMocks() // 先清 spy，再建库（避免上个用例的 getDatabase spy 污染建库流程）
  await setupTestDb()
})

describe('getRegionStockMap 动态映射', () => {
  it('上市公司的 区域名 → [股票代码] 映射（代码转大写、去重）', () => {
    const db = getDatabase()
    db.run("INSERT INTO regions (id, name) VALUES (1, 'A区'), (2, 'B区')")
    db.run(`
      INSERT INTO companies (name, region_id, is_listed, stock_symbol) VALUES
      ('建工集团', 1, 1, 'jGONG'),
      ('建工二局', 1, 1, 'jgong'),          -- 同代码小写 → 去重且转大写
      ('物流股份', 2, 1, 'WULIU'),
      ('未上市公司', 2, 0, 'HIDDEN'),       -- 未上市 → 排除
      ('无代码公司', 1, 1, '')              -- 空代码 → 排除
    `)

    expect(getRegionStockMap()).toEqual({
      'A区': ['JGONG'],
      'B区': ['WULIU']
    })
  })

  it('region_id 为空的公司归入"未分区"', () => {
    const db = getDatabase()
    db.run("INSERT INTO regions (id, name) VALUES (1, 'A区')")
    db.run("INSERT INTO companies (name, region_id, is_listed, stock_symbol) VALUES ('散户公司', NULL, 1, 'LONELY')")

    expect(getRegionStockMap()).toEqual({ '未分区': ['LONELY'] })
  })

  it('数据库无上市公司时返回空映射（不抛错）', () => {
    expect(getRegionStockMap()).toEqual({})
  })

  it('getDatabase 抛错（数据库未就绪）时静默返回空映射', () => {
    vi.spyOn(connectionModule, 'getDatabase').mockImplementation(() => {
      throw new Error('Database not initialized')
    })
    expect(getRegionStockMap()).toEqual({})
  })
})

describe('getMappedSymbols', () => {
  it('合并数据库映射与回退映射（FALLBACK_MAP），去重', () => {
    const db = getDatabase()
    db.run("INSERT INTO regions (id, name) VALUES (1, 'A区')")
    db.run("INSERT INTO companies (name, region_id, is_listed, stock_symbol) VALUES ('建工集团', 1, 1, 'JGONG')")

    const symbols = getMappedSymbols()
    // 数据库里的 JGONG 与回退表 A区 的 JGONG 合并去重
    expect(symbols).toContain('JGONG')
    expect(symbols).toContain('JXIAO')
    expect(symbols).toContain('WULIU')
    expect(symbols).toContain('YLIAO')
    expect(new Set(symbols).size).toBe(symbols.length) // 无重复
  })
})
