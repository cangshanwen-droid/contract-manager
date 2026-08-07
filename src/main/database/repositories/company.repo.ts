import { getDatabase } from '../connection'
import { queryAll, queryOne } from '../helpers'
import type { Company } from '../../../shared/types'

export class CompanyRepository {
  list(): Company[] {
    return queryAll(
      'SELECT * FROM companies WHERE is_active = 1 ORDER BY name'
    ) as Company[]
  }

  getById(id: number): Company | undefined {
    const r = queryOne('SELECT * FROM companies WHERE id = ?', [id])
    return r ? (r as Company) : undefined
  }

  create(data: Partial<Company>): Company {
    const db = getDatabase()
    db.run(
      `INSERT INTO companies (name, region, company_type, contact, phone, email, address, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name || '',
        data.region || '',
        data.company_type || '',
        data.contact || '',
        data.phone || '',
        data.email || '',
        data.address || '',
        data.notes || ''
      ]
    )
    const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number
    return this.getById(id)!
  }

  update(id: number, data: Partial<Company>): Company | undefined {
    const fields = Object.keys(data).filter((k) => k !== 'id' && k !== 'created_at')
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
