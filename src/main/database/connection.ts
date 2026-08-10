import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js'

let db: SqlJsDatabase | null = null
let dbPath: string = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null
let SQLModule: SqlJsStatic | null = null

// ── 立即持久化（P0-8 断电丢失修复）──────────────────────────────
// sql.js 是内存数据库，原实现仅靠 2 秒 debounce 定时器落盘，
// 断电/崩溃会丢失最近 2 秒的写入。现在改为：
//   - 单条写语句（非事务内）→ 执行后立即同步 export + writeFileSync
//   - 事务内（BEGIN..COMMIT）→ 合并写盘，COMMIT 后一次性落盘
//   - ROLLBACK → 丢弃事务内未落盘的脏标记
// 数据库文件仅 ~136KB，全量写盘 <5ms，无性能负担。

let txnDepth = 0
let pendingWrite = false

const WRITE_RE =
  /^\s*(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE|VACUUM|REINDEX)\b/i
const WRITE_KEYWORD_RE =
  /\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE|VACUUM|REINDEX)\b/i

/**
 * 跟踪一条已执行的 SQL，决定是否立即落盘。
 * 由被包装的 db.run / db.exec 以及 helpers.execute 调用。
 */
export function notifyWrite(sql: string): void {
  if (!db) return
  const trimmed = sql.trim()
  if (/^BEGIN\b/i.test(trimmed)) {
    txnDepth++
    return
  }
  if (/^COMMIT\b/i.test(trimmed) || /^END\b/i.test(trimmed)) {
    if (txnDepth > 0) txnDepth--
    if (txnDepth === 0 && pendingWrite) {
      pendingWrite = false
      _flushSave()
    }
    return
  }
  if (/^ROLLBACK\b/i.test(trimmed)) {
    if (txnDepth > 0) txnDepth--
    // 事务内尚未落盘的写入随回滚作废
    pendingWrite = false
    return
  }
  const isWrite = WRITE_RE.test(trimmed) || (trimmed.includes(';') && WRITE_KEYWORD_RE.test(trimmed))
  if (!isWrite) return
  pendingWrite = true
  if (txnDepth === 0) {
    pendingWrite = false
    _flushSave()
  }
}

/**
 * 包装 sql.js 实例的 run/exec，使所有写路径（含 handlers 里
 * 直接 getDatabase().run(...) 的调用）都能触发立即持久化。
 */
function patchDatabase(instance: SqlJsDatabase): void {
  const rawRun = instance.run.bind(instance)
  const rawExec = instance.exec.bind(instance)
  ;(instance as any).run = (sql: string, params?: unknown[]): unknown => {
    const result = rawRun(sql, params as any)
    notifyWrite(sql)
    return result
  }
  ;(instance as any).exec = (sql: string, params?: unknown[]): unknown => {
    const result = rawExec(sql, params as any)
    notifyWrite(sql)
    return result
  }
}

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs({
    locateFile: (file: string) => {
      const appPath = app.getAppPath()
      const isAsar = appPath.includes('.asar')
      const basePath = isAsar ? appPath.replace('.asar', '.asar.unpacked') : appPath
      return path.join(basePath, 'node_modules', 'sql.js', 'dist', file)
    }
  })
  SQLModule = SQL
  dbPath = path.join(app.getPath('userData'), 'contract-manager.db')
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }
  patchDatabase(db)
  txnDepth = 0
  pendingWrite = false
}

export function getDatabase(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized')
  return db
}

// Debounced save - coalesces rapid writes (兼容旧调用方)
export function saveDatabase(immediate = false): void {
  if (!db) return
  if (saveTimer) clearTimeout(saveTimer)
  if (immediate) {
    _flushSave()
    return
  }
  saveTimer = setTimeout(_flushSave, 2000)
}

function _flushSave(): void {
  if (!db) return
  const data = db.export()
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  // P0-4 原子落盘：先写临时文件，再 rename 原子替换，避免写盘中断导致主库损坏；
  // 替换前将上一份完整文件保留为 .bak，崩溃后可人工恢复。
  const tmpPath = `${dbPath}.tmp`
  fs.writeFileSync(tmpPath, Buffer.from(data))
  if (fs.existsSync(dbPath)) {
    try { fs.copyFileSync(dbPath, `${dbPath}.bak`) } catch { /* .bak 失败不影响主流程 */ }
  }
  fs.renameSync(tmpPath, dbPath)
}

export function closeDatabase(): void {
  if (saveTimer) clearTimeout(saveTimer)
  _flushSave()
  if (db) { db.close(); db = null }
}

/**
 * 从备份文件恢复数据库：整体替换内存库并立即落盘。
 * 由 backup.handler 的 DB_RESTORE 调用（先 saveDatabase(true) 再恢复）。
 */
export function restoreDatabaseFromFile(filePath: string): void {
  if (!SQLModule) throw new Error('SQL 引擎未初始化')
  if (!fs.existsSync(filePath)) throw new Error('备份文件不存在')
  const buffer = fs.readFileSync(filePath)
  if (db) {
    try { db.close() } catch { /* ignore */ }
    db = null
  }
  db = new SQLModule.Database(buffer)
  patchDatabase(db)
  txnDepth = 0
  pendingWrite = false
  _flushSave()
}
