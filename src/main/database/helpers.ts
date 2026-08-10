import { getDatabase, notifyWrite } from './connection'
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
  // 立即持久化（写语句走 notifyWrite 落盘；SELECT 无副作用）
  notifyWrite(sql)
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
 *
 * P0-3 防御：ALTER TABLE ADD COLUMN 无 IF NOT EXISTS 语义，若迁移中途失败
 * （版本号未写入 schema_migrations），重启重跑会 duplicate column 崩溃。
 * 这里逐条执行并先查 PRAGMA table_info，列已存在则跳过，保证幂等可重跑。
 */
export function executeMulti(sql: string): void {
  const db = getDatabase()
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  // P1-4：批量语句包事务合并落盘（migrations 场景：19+ 迁移的每条语句原本
  // 触发一次全量 export+写盘，事务包裹后 COMMIT 才落盘一次）。
  // 若语句自带 BEGIN/COMMIT（如 v20 重建表迁移），则不重复包裹，避免嵌套事务报错。
  const hasExplicitTxn = statements.some(
    (s) => /^\s*BEGIN\b/i.test(s) || /^\s*COMMIT\b/i.test(s) || /^\s*END\b/i.test(s)
  )
  if (!hasExplicitTxn) db.run('BEGIN TRANSACTION')
  try {
    for (const stmt of statements) {
      // 去掉整行 `--` 注释后再判断是否为 ALTER（v19 等迁移的 ALTER 前有注释行）
      const cleanStmt = stmt.replace(/^\s*--.*$/gm, '').trim()
      const alterMatch = /^ALTER\s+TABLE\s+([^\s]+)\s+ADD\s+COLUMN\s+([^\s]+)/i.exec(cleanStmt)
      if (alterMatch) {
        const table = alterMatch[1]
        const column = alterMatch[2]
        const cols = queryAll(`PRAGMA table_info(${table})`) as { name: string }[]
        if (cols.some((c) => c.name === column)) {
          console.log(`[migrations] 列已存在，跳过: ${table}.${column}`)
          continue
        }
      }
      db.run(stmt)
    }
    if (!hasExplicitTxn) db.run('COMMIT')
  } catch (err) {
    if (!hasExplicitTxn) {
      try { db.run('ROLLBACK') } catch { /* ROLLBACK 失败不影响原始异常 */ }
    }
    throw err
  }
}
