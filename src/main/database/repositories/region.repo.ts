import { getDatabase } from '../connection'
import { queryAll, queryOne } from '../helpers'
import type { Region } from '../../../shared/types'

export class RegionRepository {
  list(): Region[] {
    return queryAll('SELECT * FROM regions ORDER BY name') as Region[]
  }

  getById(id: number): Region | undefined {
    const r = queryOne('SELECT * FROM regions WHERE id = ?', [id])
    return r ? (r as Region) : undefined
  }

  create(data: Partial<Region>): Region {
    const db = getDatabase()
    db.run(
      `INSERT INTO regions (name, population, talent_population, carbon_emissions,
        population_capacity, base_growth_rate)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.name || '',
        data.population || 0,
        data.talent_population || 0,
        data.carbon_emissions || 0,
        data.population_capacity || 10000,
        data.base_growth_rate ?? 0.03
      ]
    )
    const id = (db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number)
    return this.getById(id)!
  }

  update(id: number, data: Partial<Region>): Region | undefined {
    const fields = Object.keys(data)
      .filter((k) => k !== 'id' && k !== 'created_at')
    if (fields.length === 0) return this.getById(id)
    const setClause = fields.map((k) => `${k} = ?`).join(', ')
    const values = fields.map((k) => (data as Record<string, unknown>)[k])
    getDatabase().run(
      `UPDATE regions SET ${setClause}, updated_at = datetime('now','localtime') WHERE id = ?`,
      [...values, id]
    )
    return this.getById(id)
  }

  delete(id: number): void {
    getDatabase().run('DELETE FROM regions WHERE id = ?', [id])
  }
}
