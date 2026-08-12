/**
 * 交付前业务/数据验收审计 — 临时测试（审计后删除）
 * 覆盖：
 *  A. computeContractAmounts 业务正确性（税率/显式金额/舍入）
 *  B. validateContractStatusTransition 状态机
 *  C. 迁移 v20/v21：全新库 + 模拟用户升级（旧表语义→重建）
 *  D. 端到端资金链路（IPC handler 级）：创建→审批→执行→支出→完成→收入
 *  E. 余额不足场景（预检/入账）行为确认
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'
import { setupTestDb } from './helpers/setup'
import { getDatabase } from '../src/main/database/connection'
import { ContractRepository, computeContractAmounts, validateContractStatusTransition } from '../src/main/database/repositories/contract.repo'
import { setSessionUser } from '../src/main/session'
import { registerContractHandlers } from '../src/main/ipc/contract.handler'
import { IPC_CHANNELS } from '../src/shared/constants'
import { runMigrations } from '../src/main/database/migrations'

type Handler = (...args: any[]) => unknown

function captureHandler(channel: string): Handler | null {
  const handleMock = ipcMain.handle as unknown as ReturnType<typeof vi.fn>
  const call = handleMock.mock.calls.find((c) => c[0] === channel)
  return call ? (call[1] as Handler) : null
}

let repo: ContractRepository

async function setupBase() {
  await setupTestDb()
  const db = getDatabase()
  // 合同类型 1..7（7=销售 5=投资 6=拨款）
  db.run("INSERT INTO contract_types (id, name) VALUES (1,'基建'),(2,'开采'),(3,'采购'),(4,'劳动力'),(5,'投资'),(6,'拨款'),(7,'销售')")
  db.run("INSERT INTO regions (id, name) VALUES (1, 'A区')")
  db.run("INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', 'x', 'admin')")
  db.run("INSERT INTO region_accounts (account_name, region_id, balance, is_master) VALUES ('A区主账户', 1, 1000000, 1)")
  repo = new ContractRepository()
}

describe('A. computeContractAmounts', () => {
  beforeEach(async () => { await setupBase() })

  it('销售合同(7)：成本含税推算，收入=数量×单价(不含税)', () => {
    const r = computeContractAmounts(7, [
      { quantity: 2, unit_price: 100, tax_rate: 13 }
    ])
    expect(r.total_cost).toBe(226) // 2*100*1.13
    expect(r.expected_income).toBe(200) // 2*100
  })

  it('显式金额优先：投资合同(5) total_cost/expected_income 原样保留', () => {
    const r = computeContractAmounts(5, [
      { quantity: 1, unit_price: 100, tax_rate: 13, total_cost: 100000, expected_income: 12000 }
    ])
    expect(r.total_cost).toBe(100000)
    expect(r.expected_income).toBe(12000)
  })

  it('多明细累加 + 末尾舍入到分', () => {
    const r = computeContractAmounts(7, [
      { quantity: 3, unit_price: 0.1, tax_rate: 13 },
      { quantity: 2, unit_price: 100, tax_rate: 0 }
    ])
    expect(r.total_cost).toBe(200.34) // round(0.339)+200
  })

  it('空明细返回 0', () => {
    const r = computeContractAmounts(7, [])
    expect(r).toEqual({ total_cost: 0, expected_income: 0 })
  })

  it('非销售合同无显式收益 → expected_income=0', () => {
    const r = computeContractAmounts(1, [{ quantity: 10, unit_price: 2000, tax_rate: 0 }])
    expect(r.total_cost).toBe(20000)
    expect(r.expected_income).toBe(0)
  })
})

describe('B. validateContractStatusTransition', () => {
  it('draft→active 必须已审批', () => {
    expect(validateContractStatusTransition('draft', 'active', 'none')).toContain('未审批')
    expect(validateContractStatusTransition('draft', 'active', 'approved')).toBeNull()
  })
  it('禁止跳转 draft→completed', () => {
    expect(validateContractStatusTransition('draft', 'completed', 'approved')).toContain('不允许')
  })
  it('active→completed 合法', () => {
    expect(validateContractStatusTransition('active', 'completed')).toBeNull()
  })
  it('draft/active→expired 合法；expired 为终态', () => {
    expect(validateContractStatusTransition('draft', 'expired')).toBeNull()
    expect(validateContractStatusTransition('active', 'expired')).toBeNull()
    expect(validateContractStatusTransition('expired', 'active')).toContain('不允许')
  })
  it('非法枚举拒绝；同状态不变更返回 null', () => {
    expect(validateContractStatusTransition('draft', 'paused')).toContain('非法状态')
    expect(validateContractStatusTransition('draft', 'draft')).toBeNull()
    expect(validateContractStatusTransition(null, null)).toBeNull()
  })
  it('completed→active 拒绝', () => {
    expect(validateContractStatusTransition('completed', 'active')).toContain('不允许')
  })
})

describe('C. 迁移 v20~v26', () => {
  beforeEach(async () => { await setupBase() })

  it('C1 全新库：全部 25 个迁移执行成功，生成列口径正确', async () => {
    const db = getDatabase()
    const rows = db.exec('SELECT version FROM schema_migrations ORDER BY version')[0].values
    expect(rows.length).toBe(26)
    expect(rows[25][0]).toBe(26)
    // 新口径：tax_rate=13 → tax_amount=26, total=226
    const c = repo.create({
      contract_name: '税率合同', contract_type_id: 7, region_id: 1, created_by: 'op',
      items: [{ item_name: '商品', quantity: 2, unit_price: 100, tax_rate: 13 }]
    })
    const item = c.items![0]
    expect(item.tax_amount).toBeCloseTo(26, 5)
    expect(item.total).toBeCloseTo(226, 5)
    expect(item.amount).toBeCloseTo(200, 5)
  })

  it('C2 幂等：已全部迁移的库重跑 runMigrations 不报错、不重复', () => {
    const db = getDatabase()
    expect(() => runMigrations()).not.toThrow()
    const rows = db.exec('SELECT count(*) FROM schema_migrations')[0].values[0][0]
    expect(rows).toBe(26)
  })

  it('C3 模拟用户升级：v19 旧表（税率当小数用）→ 重跑迁移 → v20 重建、数据保留、口径修正', () => {
    const db = getDatabase()
    // ── 构造 v19 时代的旧 contract_items（旧生成列：tax_rate 未除 100）──
    db.run('DROP TABLE contract_items')
    db.run(`CREATE TABLE contract_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      item_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      amount REAL GENERATED ALWAYS AS (quantity * unit_price) STORED,
      land_area REAL NOT NULL DEFAULT 0,
      total_land_area REAL GENERATED ALWAYS AS (quantity * land_area) STORED,
      tax_rate REAL DEFAULT 0,
      tax_amount REAL GENERATED ALWAYS AS (ROUND(quantity * unit_price * tax_rate, 2)) STORED,
      total REAL GENERATED ALWAYS AS (quantity * unit_price * (1 + tax_rate)) STORED,
      sort_order INTEGER DEFAULT 0,
      skill_level REAL DEFAULT 0,
      carbon_factor REAL DEFAULT 0,
      expected_income REAL DEFAULT 0,
      total_cost REAL DEFAULT 0
    )`)
    db.run('CREATE INDEX IF NOT EXISTS idx_contract_items_contract ON contract_items(contract_id)')
    db.run("INSERT INTO contracts (id, contract_no, contract_name, contract_type_id, status, approval_status, created_by) VALUES (999, 'CT-2026-9999', '旧合同', 7, 'draft', 'none', 'op')")
    // 旧库写入：tax_rate=13（百分比），旧列按 1300% 错误计算
    db.run(`INSERT INTO contract_items (contract_id, item_name, quantity, unit_price, tax_rate, sort_order, expected_income, total_cost)
            VALUES (999, '旧商品', 2, 100, 13, 0, 0, 0)`)
    const old = db.exec('SELECT tax_amount, total FROM contract_items WHERE contract_id=999')[0].values[0]
    expect(old[0]).toBe(2600) // 旧错误口径：1300%
    expect(old[1]).toBe(2800)
    // 模拟 v19 用户：schema_migrations 只有 1..19
    db.run('DELETE FROM schema_migrations WHERE version >= 20')
    // ── 用户升级：重跑迁移 → v20 重建表 ──
    expect(() => runMigrations()).not.toThrow()
    const item = db.exec('SELECT item_name, tax_rate, tax_amount, total, amount FROM contract_items WHERE contract_id=999')[0].values[0]
    expect(item[0]).toBe('旧商品')      // 数据保留
    expect(item[1]).toBe(13)            // 存储值不变（仍是百分比）
    expect(item[2]).toBeCloseTo(26, 5)  // 新口径：2*100*13/100
    expect(item[3]).toBeCloseTo(226, 5)
    expect(item[4]).toBeCloseTo(200, 5)
    // 外键/索引完好，且 id 序列不冲突：新增明细 id 不撞
    const maxId = db.exec('SELECT MAX(id) FROM contract_items')[0].values[0][0]
    expect(maxId).toBe(1)
    // v21 索引存在
    const idx = db.exec("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_contracts_created_at'")
    expect(idx.length).toBe(1)
  })
})

describe('D. 端到端资金链路（IPC 级）', () => {
  let createH: Handler | null, updateH: Handler | null, approveH: Handler | null
  beforeEach(async () => {
    await setupBase()
    setSessionUser({ id: 1, username: 'admin', role: 'admin', permissions: ['contract.view', 'contract.create', 'contract.edit', 'contract.approve'] })
    ;(ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mockClear()
    registerContractHandlers()
    createH = captureHandler(IPC_CHANNELS.CONTRACT_CREATE)
    updateH = captureHandler(IPC_CHANNELS.CONTRACT_UPDATE)
    approveH = captureHandler(IPC_CHANNELS.CONTRACT_APPROVE)
  })

  it('D1 主链路：创建→提交→审批→执行(支出)→完成(收入)，金额一致', () => {
    const created = createH!(null, {
      contract_name: '销售合同A', contract_type_id: 7, region_id: 1,
      party_a: '甲方', party_b_name: '乙方',
      items: [{ item_name: '商品', quantity: 2, unit_price: 100, tax_rate: 13 }]
    }) as any
    expect(created.total_cost).toBe(226)
    expect(created.expected_income).toBe(200)
    expect(created.status).toBe('draft')
    expect(created.approval_status).toBe('none')
    const id = created.id

    approveH!(null, id, 'submit')
    const approved = approveH!(null, id, 'approve') as any
    expect(approved.approval_status).toBe('approved')

    const active = updateH!(null, id, { status: 'active' }) as any
    expect(active.status).toBe('active')

    const db = getDatabase()
    const txs = db.exec("SELECT trans_type, category, amount FROM account_transactions WHERE contract_id=? ORDER BY id", [id])[0]?.values || []
    expect(txs).toEqual([['expense', '合同支出', 226]])
    let bal = db.exec('SELECT balance FROM region_accounts WHERE region_id=1 AND is_master=1')[0].values[0][0]
    expect(bal).toBe(1000000 - 226)

    updateH!(null, id, { status: 'completed' })
    const txs2 = db.exec("SELECT trans_type, category, amount FROM account_transactions WHERE contract_id=? ORDER BY id", [id])[0]?.values || []
    expect(txs2).toEqual([['expense', '合同支出', 226], ['income', '合同收入', 200]])
    bal = db.exec('SELECT balance FROM region_accounts WHERE region_id=1 AND is_master=1')[0].values[0][0]
    expect(bal).toBe(1000000 - 226 + 200)
  })

  it('D2 未审批直接置 active 被拒绝', () => {
    const created = createH!(null, {
      contract_name: 'X', contract_type_id: 1, region_id: 1,
      items: [{ item_name: 'a', quantity: 1, unit_price: 100, tax_rate: 0 }]
    }) as any
    const res = updateH!(null, created.id, { status: 'active' }) as any
    expect(res.success).toBe(false)
    expect(String(res.message)).toContain('未审批')
    const after = repo.getById(created.id)!
    expect(after.status).toBe('draft')
  })

  it('D3 幂等：重复置 active/completed 不重复入账', () => {
    const created = createH!(null, {
      contract_name: 'Y', contract_type_id: 7, region_id: 1,
      items: [{ item_name: 'a', quantity: 1, unit_price: 100, tax_rate: 0 }]
    }) as any
    approveH!(null, created.id, 'submit')
    approveH!(null, created.id, 'approve')
    updateH!(null, created.id, { status: 'active' })
    updateH!(null, created.id, { status: 'active' }) // 重复
    updateH!(null, created.id, { status: 'completed' })
    updateH!(null, created.id, { status: 'completed' }) // 重复
    const db = getDatabase()
    const txs = db.exec("SELECT trans_type, amount FROM account_transactions WHERE contract_id=?", [created.id])[0]?.values || []
    expect(txs).toEqual([['expense', 100], ['income', 100]])
  })
})

describe('E. 余额不足场景', () => {
  let createH: Handler | null, updateH: Handler | null, approveH: Handler | null
  beforeEach(async () => {
    await setupBase()
    const db = getDatabase()
    db.run('UPDATE region_accounts SET balance = 100 WHERE region_id=1') // 余额 100 < 226
    setSessionUser({ id: 1, username: 'admin', role: 'admin', permissions: ['contract.view', 'contract.create', 'contract.edit', 'contract.approve'] })
    ;(ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mockClear()
    registerContractHandlers()
    createH = captureHandler(IPC_CHANNELS.CONTRACT_CREATE)
    updateH = captureHandler(IPC_CHANNELS.CONTRACT_UPDATE)
    approveH = captureHandler(IPC_CHANNELS.CONTRACT_APPROVE)
  })

  it('E1 余额不足：拒绝入账且不产生负余额', () => {
    const created = createH!(null, {
      contract_name: 'Z', contract_type_id: 7, region_id: 1,
      items: [{ item_name: 'a', quantity: 2, unit_price: 100, tax_rate: 13 }]
    }) as any
    approveH!(null, created.id, 'submit')
    approveH!(null, created.id, 'approve')
    const res = updateH!(null, created.id, { status: 'active' }) as any
    const db = getDatabase()
    const bal = db.exec('SELECT balance FROM region_accounts WHERE region_id=1 AND is_master=1')[0].values[0][0]
    const txCount = db.exec('SELECT COUNT(*) FROM account_transactions')[0].values[0][0]
    expect(bal).toBe(100) // 余额未被扣减
    expect(txCount).toBe(0) // 无支出流水
    // P1-1 修复后正确行为：余额不足拒绝变更，状态回滚保持 draft（不允许「active 但无流水」）
    const after = repo.getById(created.id)!
    console.log('E1_DEBUG res.success=', res?.success, 'message=', res?.message, 'status=', after.status)
    expect(res.success).toBe(false)
    expect(String(res.message)).toContain('余额不足')
    expect(after.status).toBe('draft')
  })
})
