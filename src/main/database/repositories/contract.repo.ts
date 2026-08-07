import { getDatabase } from '../connection'
import { queryAll, queryOne } from '../helpers'
import type { Contract, ContractItem, ContractWithItems } from '../../../shared/types'

export class ContractRepository {
  list(regionId?: number): Contract[] {
    let sql = `SELECT c.*, ct.name as contract_type_name, r.name as region_name
               FROM contracts c
               LEFT JOIN contract_types ct ON ct.id = c.contract_type_id
               LEFT JOIN regions r ON r.id = c.region_id`
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
      `SELECT c.*, ct.name as contract_type_name, r.name as region_name
       FROM contracts c
       LEFT JOIN contract_types ct ON ct.id = c.contract_type_id
       LEFT JOIN regions r ON r.id = c.region_id
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
    db.run('BEGIN TRANSACTION')
    try {
      db.run(
        `INSERT INTO contracts (contract_no, contract_name, contract_type_id, party_a, party_b_id, party_b_name, region_id, sign_date, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          contractNo,
          data.contract_name,
          data.contract_type_id || null,
          data.party_a || '',
          data.party_b_id || null,
          data.party_b_name || '',
          data.region_id || null,
          data.sign_date || null,
          data.status || 'active',
          data.notes || ''
        ]
      )
      const contractId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number

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

  delete(id: number): void {
    const db = getDatabase()
    db.run('DELETE FROM contract_items WHERE contract_id = ?', [id])
    db.run('DELETE FROM contracts WHERE id = ?', [id])
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
        total_population: 0,
        total_talent: 0,
        total_carbon: 0,
        total_supply: 0,
        sold_quantity: 0,
        avg_unit_price: 0,
        infra_bonuses: [],
        infra_population_delta: 0
      }
    }

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
      const items = queryAll(
        'SELECT * FROM contract_items WHERE contract_id = ?',
        [c.id]
      ) as ContractItem[]

      for (const item of items) {
        // 劳动力雇佣合同 (type_id=4)：人口增量、人才、工资
        if (c.contract_type_id === 4) {
          result.total_population += item.quantity
          if ((item.skill_level ?? 0) >= 0.5) {
            result.total_talent += item.quantity
          }
          result.total_labor_salary += (item.unit_price || 0) * item.quantity
        }
        // 开采合同 (type_id=2)：碳排放 = 数量，原矿供应量
        if (c.contract_type_id === 2) {
          result.total_carbon += item.quantity * (item.carbon_factor || 1.0)
          result.total_supply += item.quantity
        }
        // 采购合同 (type_id=3)：供应总值
        if (c.contract_type_id === 3) {
          result.total_supply_value += item.amount || (item.quantity * item.unit_price)
        }
        // 销售合同 (type_id=7)：销量、均价
        if (c.contract_type_id === 7) {
          result.sold_quantity += item.quantity
          result.total_amount += item.amount || (item.quantity * item.unit_price)
        }
        // 基建合同 (type_id=1)：就业率加成、人口增量、减排
        if (c.contract_type_id === 1) {
          const bonusRow = queryOne(
            'SELECT bonus FROM infra_employment_bonuses WHERE item_name = ?',
            [item.item_name]
          )
          if (bonusRow) {
            result.infra_bonuses.push({
              name: item.item_name,
              bonus: (bonusRow.bonus as number) * item.quantity
            })
          }
          // 产业配套基建的减排量
          const carbonRow = queryOne(
            'SELECT carbon_reduction FROM infrastructure_types WHERE name = ?',
            [item.item_name]
          )
          if (carbonRow && (carbonRow.carbon_reduction as number) > 0) {
            result.infra_carbon_reduction += (carbonRow.carbon_reduction as number) * item.quantity
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
