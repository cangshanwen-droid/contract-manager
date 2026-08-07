import { getDatabase } from './connection'
import { Database } from 'sql.js'

/**
 * sql.js 查询辅助：执行 SELECT 返回对象数组
 */
export function queryAll(sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const db = getDatabase()
  const stmt = db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  const results: Record<string, unknown>[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject())
  }
  stmt.free()
  return results
}

/**
 * 查询单行
 */
export function queryOne(sql: string, params: unknown[] = []): Record<string, unknown> | null {
  const results = queryAll(sql, params)
  return results.length > 0 ? results[0] : null
}

/**
 * 执行 INSERT/UPDATE/DELETE，返回 affected rows
 */
export function execute(sql: string, params: unknown[] = []): number {
  const db = getDatabase()
  const stmt = db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  stmt.step()
  const modified = db.getRowsModified()
  stmt.free()
  return modified
}

/**
 * 获取最后插入的 ID
 */
export function lastInsertId(): number {
  const db = getDatabase()
  const result = db.exec('SELECT last_insert_rowid() as id')
  if (result.length > 0 && result[0].values.length > 0) {
    return result[0].values[0][0] as number
  }
  return 0
}

/**
 * 执行多条 SQL 语句（用于迁移）
 */
export function executeMulti(sql: string): void {
  const db = getDatabase()
  db.run(sql)
}
