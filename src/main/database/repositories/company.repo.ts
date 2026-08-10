import { getDatabase } from '../connection'
import { queryAll, queryOne } from '../helpers'
import type { Company } from '../../../shared/types'

/**
 * update() 字段白名单（P1-4 修复，与 contract.repo 一致）：
 * 仅允许更新业务列；id / created_at / updated_at / is_active（软删除标记）等系统列禁止透传，
 * 防止调用方通过 Object.keys(data) 任意拼 SET 列（值已参数化无注入，但字段可被乱改）。
 */
const UPDATE_ALLOWED_FIELDS = [
  'name', 'region', 'region_id', 'company_type', 'contact', 'phone', 'email',
  'address', 'notes', 'employee_count', 'annual_output', 'carbon_emission',
  'is_listed', 'stock_symbol', 'stock_initial_price'
]

export class CompanyRepository {
  list(): Company[] {
    return queryAll(
      `SELECT c.*, r.name as region_name
       FROM companies c
       LEFT JOIN regions r ON r.id = c.region_id
       WHERE c.is_active = 1
       ORDER BY c.name`
    ) as Company[]
  }

  getById(id: number): Company | undefined {
    const r = queryOne(
      `SELECT c.*, r.name as region_name
       FROM companies c
       LEFT JOIN regions r ON r.id = c.region_id
       WHERE c.id = ? AND c.is_active = 1`,
      [id]
    )
    return r ? (r as Company) : undefined
  }

  create(data: Partial<Company>): Company {
    const db = getDatabase()
    db.run(
      `INSERT INTO companies (name, region, region_id, company_type, contact, phone, email, address, notes, is_listed, stock_symbol, stock_initial_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name || '',
        data.region || '',
        data.region_id ?? null,
        data.company_type || '',
        data.contact || '',
        data.phone || '',
        data.email || '',
        data.address || '',
        data.notes || '',
        data.is_listed || 0,
        data.stock_symbol || '',
        data.stock_initial_price ?? 100
      ]
    )
    const id = (db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number)
    return this.getById(id)!
  }

  update(id: number, data: Partial<Company>): Company | undefined {
    const fields = Object.keys(data).filter((k) => UPDATE_ALLOWED_FIELDS.includes(k))
    if (fields.length === 0) return this.getById(id)
    const setClause = fields.map((k) => `${k} = ?`).join(', ')
    const values = fields.map((k) => (data as Record<string, unknown>)[k])
    getDatabase().run(
      `UPDATE companies SET ${setClause}, updated_at = datetime('now','localtime') WHERE id = ?`,
      [...values, id]
    )
    return this.getById(id)
  }

  delete(id: number): void {
    getDatabase().run('UPDATE companies SET is_active = 0 WHERE id = ?', [id])
  }
}
