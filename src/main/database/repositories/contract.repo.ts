import { getDatabase } from '../connection'
import { queryAll, queryOne } from '../helpers'
import type { Contract, ContractItem, ContractWithItems } from '../../../shared/types'

/**
 * update() 字段白名单（P0-2 防伪造）：
 * 仅允许更新业务字段；approval_status / approved_by / approved_at 属审批字段，
 * 只能经 transitionApproval() 状态机修改，禁止从 update() 透传，防止调用方伪造审批状态。
 * updated_by / party_b_name 为合法审计与业务列（v10/v1 迁移），保留可更新。
 */
const UPDATE_ALLOWED_FIELDS = [
  'contract_name', 'status', 'notes', 'total_cost', 'progress', 'expected_income',
  'sign_date', 'party_a', 'party_b_id', 'party_b_name', 'region_id', 'contract_type_id',
  'updated_by'
]

export class ContractRepository {
  list(regionId?: number): Contract[] {
    let sql = `SELECT c.*, ct.name as contract_type_name, r.name as region_name, comp.name as company_name
               FROM contracts c
               LEFT JOIN contract_types ct ON ct.id = c.contract_type_id
               LEFT JOIN regions r ON r.id = c.region_id
               LEFT JOIN companies comp ON comp.id = c.party_b_id`
    const params: unknown[] = []
    if (regionId) {
      sql += ' WHERE c.region_id = ?'
      params.push(regionId)
    }
    sql += ' ORDER BY c.created_at DESC'
    return queryAll(sql, params) as Contract[]
  }

  getById(id: number): ContractWithItems | undefined {
    const contract = queryOne(
      `SELECT c.*, ct.name as contract_type_name, r.name as region_name, comp.name as company_name
       FROM contracts c
       LEFT JOIN contract_types ct ON ct.id = c.contract_type_id
       LEFT JOIN regions r ON r.id = c.region_id
       LEFT JOIN companies comp ON comp.id = c.party_b_id
       WHERE c.id = ?`,
      [id]
    ) as ContractWithItems | undefined
    if (!contract) return undefined
    contract.items = queryAll(
      'SELECT * FROM contract_items WHERE contract_id = ? ORDER BY sort_order',
      [id]
    ) as ContractItem[]
    return contract
  }

  create(data: {
    contract_name: string
    contract_type_id: number
    party_a?: string
    party_b_name?: string
    party_b_id?: number | null
    region_id?: number | null
    sign_date?: string | null
    status?: string
    notes?: string
    created_by?: string
    items: Partial<ContractItem>[]
  }): ContractWithItems {
    const db = getDatabase()

    // 生成合同编号
    const prefix = 'CT'
    const year = new Date().getFullYear()
    const maxRow = queryOne(
      `SELECT MAX(CAST(SUBSTR(contract_no, -4) AS INTEGER)) as max_seq
       FROM contracts WHERE contract_no LIKE ?`,
      [`${prefix}-${year}-%`]
    )
    const nextSeq = ((maxRow?.max_seq as number) ?? 0) + 1
    const contractNo = `${prefix}-${year}-${String(nextSeq).padStart(4, '0')}`

    // 事务保护：合同+明细原子写入
    let contractId = 0
    db.run('BEGIN TRANSACTION')
    try {
      // P0-2 CREATE 白名单：status/approval_status 不允许透传——
      // 新合同固定 status='draft'、approval_status='none'（未审批），
      // 执行状态与审批状态只能走 update 状态机校验 / CONTRACT_APPROVE
      db.run(
        `INSERT INTO contracts (contract_no, contract_name, contract_type_id, party_a, party_b_id, party_b_name, region_id, sign_date, status, approval_status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'none', ?, ?)`,
        [
          contractNo,
          data.contract_name,
          data.contract_type_id || null,
          data.party_a || '',
          data.party_b_id || null,
          data.party_b_name || '',
          data.region_id || null,
          data.sign_date || null,
          data.notes || '',
          data.created_by || ''
        ]
      )
      contractId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number
      if (data.items && data.items.length > 0) {
        const stmt = db.prepare(
          `INSERT INTO contract_items (contract_id, item_name, quantity, unit_price, land_area, tax_rate, skill_level, carbon_factor, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        for (const [idx, item] of data.items.entries()) {
          stmt.bind([
            contractId,
            item.item_name || '',
            item.quantity ?? 1,
            item.unit_price ?? 0,
            item.land_area ?? 0,
            item.tax_rate ?? 0,
            item.skill_level ?? 0,
            item.carbon_factor ?? 0,
            idx
          ])
          stmt.step()
          stmt.reset()
        }
      }

      db.run('COMMIT')
    } catch (err) {
      db.run('ROLLBACK')
      throw err
    }

    return this.getById(contractId)!
  }

  update(id: number, data: {
    contract_name?: string
    contract_type_id?: number
    party_a?: string
    party_b_name?: string
    party_b_id?: number | null
    region_id?: number | null
    sign_date?: string | null
    status?: string
    notes?: string
    updated_by?: string
  }): ContractWithItems | undefined {
    const db = getDatabase()
    const existing = this.getById(id)
    if (!existing) return undefined

    const fields: string[] = []
    const values: unknown[] = []
    for (const [k, v] of Object.entries(data)) {
      // P0-2 白名单：非白名单字段（approval_status/approved_by/approved_at 等）一律丢弃，
      // 防止调用方绕过 transitionApproval 状态机伪造审批
      if (v !== undefined && k !== 'items' && UPDATE_ALLOWED_FIELDS.includes(k)) {
        fields.push(`${k} = ?`)
        values.push(v)
      }
    }
    if (fields.length > 0) {
      db.run(
        `UPDATE contracts SET ${fields.join(', ')}, updated_at = datetime('now','localtime') WHERE id = ?`,
        [...values, id]
      )
    }
    return this.getById(id)
  }

  delete(id: number): void {
    const db = getDatabase()
    db.run('DELETE FROM contract_items WHERE contract_id = ?', [id])
    db.run('DELETE FROM contracts WHERE id = ?', [id])
  }

  /**
   * 审批状态流转：
   *  submit  → 草稿/已驳回 → 待审批 (提交审批)
   *  approve → 待审批 → 已审批
   *  reject  → 待审批 → 已驳回
   * 只有已审批(approval_status='approved')的合同才允许进入执行阶段、计入资金流水。
   */
  transitionApproval(id: number, action: 'submit' | 'approve' | 'reject', operator: string): ContractWithItems | undefined {
    const db = getDatabase()
    const existing = this.getById(id)
    if (!existing) return undefined

    let sql = ''
    if (action === 'submit') {
      if (!['none', 'rejected'].includes(existing.approval_status)) {
        throw new Error('仅草稿或已驳回的合同可提交审批')
      }
      sql = `UPDATE contracts SET approval_status = 'pending', approved_by = ?, approved_at = NULL, updated_at = datetime('now','localtime') WHERE id = ?`
    } else if (action === 'approve') {
      if (existing.approval_status !== 'pending') {
        throw new Error('仅待审批的合同可批准')
      }
      sql = `UPDATE contracts SET approval_status = 'approved', approved_by = ?, approved_at = datetime('now','localtime'), updated_at = datetime('now','localtime') WHERE id = ?`
    } else if (action === 'reject') {
      if (existing.approval_status !== 'pending') {
        throw new Error('仅待审批的合同可驳回')
      }
      sql = `UPDATE contracts SET approval_status = 'rejected', approved_by = ?, approved_at = datetime('now','localtime'), updated_at = datetime('now','localtime') WHERE id = ?`
    } else {
      throw new Error('未知的审批操作')
    }
    db.run(sql, [operator, id])
    return this.getById(id)
  }

  // 按区域汇总合同数据
  summarizeByRegion(regionId: number): {
    total_population: number
    total_talent: number
    total_carbon: number
    total_supply: number
    sold_quantity: number
    avg_unit_price: number
    total_labor_salary: number
    consumer_satisfaction: number
    infra_bonuses: { name: string; bonus: number }[]
    infra_population_delta: number
    infra_carbon_reduction: number
  } {
    const contracts = this.list(regionId)
    const contractIds = contracts.map((c) => c.id)
    if (contractIds.length === 0) {
      return {
        total_population: 0, total_talent: 0, total_carbon: 0,
        total_supply: 0, sold_quantity: 0, avg_unit_price: 0,
        total_labor_salary: 0, consumer_satisfaction: 0,
        infra_bonuses: [], infra_population_delta: 0, infra_carbon_reduction: 0
      }
    }

    // Batch preload: ONE query for all contract_items, bonuses, infra_types
    const placeholders = contractIds.map(() => '?').join(',')
    const allItems = queryAll(
      `SELECT * FROM contract_items WHERE contract_id IN (${placeholders})`,
      contractIds
    ) as ContractItem[]
    const allBonuses = queryAll('SELECT * FROM infra_employment_bonuses') as { item_name: string; bonus: number }[]
    const allInfraTypes = queryAll('SELECT name, carbon_reduction FROM infrastructure_types') as { name: string; carbon_reduction: number }[]

    // Build lookup maps
    const itemsByContract: Record<number, ContractItem[]> = {}
    for (const item of allItems) {
      if (!itemsByContract[item.contract_id]) itemsByContract[item.contract_id] = []
      itemsByContract[item.contract_id].push(item)
    }
    const bonusMap: Record<string, number> = {}
    for (const b of allBonuses) bonusMap[b.item_name] = b.bonus
    const carbonMap: Record<string, number> = {}
    for (const t of allInfraTypes) carbonMap[t.name] = t.carbon_reduction || 0

    let result = {
      total_population: 0,
      total_talent: 0,
      total_carbon: 0,
      total_supply: 0,
      sold_quantity: 0,
      total_amount: 0,
      total_labor_salary: 0,
      total_supply_value: 0,
      avg_unit_price: 0,
      infra_bonuses: [] as { name: string; bonus: number }[],
      infra_population_delta: 0,
      infra_carbon_reduction: 0
    }

    for (const c of contracts) {
      const items = itemsByContract[c.id] || []

      for (const item of items) {
        if (c.contract_type_id === 4) {
          result.total_population += item.quantity
          if ((item.skill_level ?? 0) >= 0.5) result.total_talent += item.quantity
          result.total_labor_salary += (item.unit_price || 0) * item.quantity
        }
        if (c.contract_type_id === 2) {
          result.total_carbon += item.quantity * (item.carbon_factor || 1.0)
          result.total_supply += item.quantity
        }
        if (c.contract_type_id === 3) {
          result.total_supply_value += item.amount || (item.quantity * item.unit_price)
        }
        if (c.contract_type_id === 7) {
          result.sold_quantity += item.quantity
          result.total_amount += item.amount || (item.quantity * item.unit_price)
        }
        if (c.contract_type_id === 1) {
          const bonus = bonusMap[item.item_name]
          if (bonus) {
            result.infra_bonuses.push({ name: item.item_name, bonus: bonus * item.quantity })
          }
          const carbonRed = carbonMap[item.item_name]
          if (carbonRed > 0) {
            result.infra_carbon_reduction += carbonRed * item.quantity
          }
          result.infra_population_delta += (item.land_area || 0) * item.quantity * 0.1
        }
      }
    }

    result.avg_unit_price =
      result.sold_quantity > 0 ? result.total_amount / result.sold_quantity : 0

    const consumerSatisfaction = result.sold_quantity > 0
      ? Math.min(1, result.total_supply / result.sold_quantity)
      : 0

    return {
      total_population: result.total_population,
      total_talent: result.total_talent,
      total_carbon: result.total_carbon,
      total_supply: result.total_supply,
      sold_quantity: result.sold_quantity,
      avg_unit_price: result.avg_unit_price,
      total_labor_salary: result.total_labor_salary,
      consumer_satisfaction: consumerSatisfaction,
      infra_bonuses: result.infra_bonuses,
      infra_population_delta: result.infra_population_delta,
      infra_carbon_reduction: result.infra_carbon_reduction
    }
  }
}
