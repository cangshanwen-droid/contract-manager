import path from 'path'
import fs from 'fs'
import { app, dialog } from 'electron'
import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js'

let db: SqlJsDatabase | null = null
let dbPath: string = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null
let SQLModule: SqlJsStatic | null = null

// ── .bak 复制限频（P1-4）：tmp+rename 已保证原子性，.bak 只是额外历史快照，
// 无需每次写盘都复制。限制 ≤1 次/分钟，DB 增长到数十 MB 后避免主进程每写阻塞一次全量文件复制。
const BAK_COPY_INTERVAL_MS = 60_000
let lastBakCopyTime = 0

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

/**
 * 尝试从文件加载数据库并做完整性校验。
 * 返回 { ok: true, db } 或 { ok: false, error }（文件不存在/损坏/校验失败均视为失败）。
 *
 * ⚠️ 修复（v1.3.0 bug）：sql.js 的 Database 原型没有 checkIntegrity() 方法，
 * 旧代码调用 candidate.checkIntegrity() 必然 throw → 每次启动误判"损坏"→
 * 数据被重置为空库并弹窗。改用 SQL 级 PRAGMA integrity_check 校验。
 */
function tryLoadDatabase(
  SQL: SqlJsStatic,
  filePath: string
): { ok: true; db: SqlJsDatabase } | { ok: false; error: string } {
  try {
    if (!fs.existsSync(filePath)) return { ok: false, error: '文件不存在' }
    const buffer = fs.readFileSync(filePath)
    const candidate = new SQL.Database(buffer)
    try {
      const res = candidate.exec('PRAGMA integrity_check')
      const ok = Array.isArray(res) && res.length > 0 && res[0]?.values?.[0]?.[0] === 'ok'
      if (!ok) {
        try { candidate.close() } catch { /* ignore */ }
        return { ok: false, error: '完整性校验失败（integrity_check）' }
      }
    } catch (err: any) {
      try { candidate.close() } catch { /* ignore */ }
      return { ok: false, error: `完整性校验异常：${err?.message || String(err)}` }
    }
    return { ok: true, db: candidate }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}

/**
 * P0-4 备份回退链：contract-manager.db.bak → backups/ 最新自动备份。
 * 返回第一个完整性校验通过的备份库；全部不可用时返回 null。
 */
function recoverFromBackups(SQL: SqlJsStatic): SqlJsDatabase | null {
  const candidates: string[] = [`${dbPath}.bak`]
  try {
    const backupDir = path.join(app.getPath('userData'), 'backups')
    if (fs.existsSync(backupDir)) {
      const newest = fs.readdirSync(backupDir)
        .filter((f) => f.startsWith('auto-backup-') && f.endsWith('.db'))
        .sort()
        .reverse()
        .map((f) => path.join(backupDir, f))
      candidates.push(...newest)
    }
  } catch { /* 备份目录不可读则跳过 */ }

  for (const candidate of candidates) {
    const result = tryLoadDatabase(SQL, candidate)
    if (result.ok) {
      console.warn(`[DB] 从备份恢复成功：${candidate}`)
      return result.db
    }
    console.warn(`[DB] 备份不可用：${candidate}（${result.error}）`)
  }
  return null
}

/** 把损坏的主库文件隔离为 .corrupt-<时间戳>.db，保留现场便于人工恢复 */
function quarantineCorruptMain(): void {
  try {
    if (fs.existsSync(dbPath)) {
      const corruptPath = `${dbPath}.corrupt-${Date.now()}`
      fs.renameSync(dbPath, corruptPath)
      console.warn(`[DB] 损坏的主库已隔离为 ${corruptPath}`)
    }
  } catch { /* 隔离失败不阻塞启动 */ }
}

function resetTxnState(): void {
  txnDepth = 0
  pendingWrite = false
}

/** 全新空库时提示用户数据已重置（仅真实 Electron 环境弹窗，测试环境静默） */
function notifyDbReset(): void {
  try {
    if (typeof dialog !== 'undefined' && dialog?.showMessageBox) {
      void dialog.showMessageBox({
        type: 'warning',
        title: '数据库已重置',
        message: '本地数据库文件已损坏且无可用备份，数据已重置为空库。',
        detail: '原损坏文件已保留为 .corrupt-*.db，如需找回数据请通过「系统设置 → 恢复数据库」选择备份恢复。',
      })
    }
  } catch { /* 弹窗失败不影响启动 */ }
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

  // 首次运行：无库文件 → 直接建新库（正常路径，不算故障）
  if (!fs.existsSync(dbPath)) {
    db = new SQL.Database()
    patchDatabase(db)
    resetTxnState()
    return
  }

  // 主库存在 → 尝试加载 + 完整性校验
  const primary = tryLoadDatabase(SQL, dbPath)
  if (primary.ok) {
    db = primary.db
    patchDatabase(db)
    resetTxnState()
    return
  }

  // ══ P0-4 主库损坏回退链：.bak → backups/ 最新备份 → 全新空库 ══
  console.warn(`[DB] 主库加载失败（${primary.error}），启动备份回退链`)
  const recovered = recoverFromBackups(SQL)
  if (recovered) {
    db = recovered
    patchDatabase(db)
    resetTxnState()
    // 先隔离损坏主库，再落盘，避免 _flushSave 把损坏文件复制成新的 .bak
    quarantineCorruptMain()
    _flushSave()
    console.warn('[DB] 已从备份恢复数据库，损坏的主库已隔离（.corrupt-*.db）')
    return
  }

  // 所有备份均不可用 → 全新空库 + 提示用户数据已重置
  console.warn('[DB] 备份回退失败，创建全新空库（数据已重置）')
  db = new SQL.Database()
  patchDatabase(db)
  resetTxnState()
  quarantineCorruptMain()
  _flushSave()
  notifyDbReset()
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
  // .bak 限频（P1-4）：仅当距上次复制超过 1 分钟才保留一份历史快照。
  // 崩溃恢复依赖的是 tmp+rename 原子性 + backups/ 自动备份，.bak 非每次写必需。
  if (fs.existsSync(dbPath)) {
    const now = Date.now()
    if (now - lastBakCopyTime >= BAK_COPY_INTERVAL_MS) {
      try {
        fs.copyFileSync(dbPath, `${dbPath}.bak`)
        lastBakCopyTime = now
      } catch { /* .bak 失败不影响主流程 */ }
    }
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
 * P0-4：恢复前校验完整性，损坏的备份文件直接拒绝，避免把坏库载入内存。
 */
export function restoreDatabaseFromFile(filePath: string): void {
  if (!SQLModule) throw new Error('SQL 引擎未初始化')
  if (!fs.existsSync(filePath)) throw new Error('备份文件不存在')
  const buffer = fs.readFileSync(filePath)
  const candidate = new SQLModule.Database(buffer)
  // 同 tryLoadDatabase 修复：sql.js 无 checkIntegrity() 方法，用 PRAGMA 校验
  try {
    const res = candidate.exec('PRAGMA integrity_check')
    const ok = Array.isArray(res) && res.length > 0 && res[0]?.values?.[0]?.[0] === 'ok'
    if (!ok) {
      try { candidate.close() } catch { /* ignore */ }
      throw new Error('备份文件完整性校验失败，请确认是有效的数据库备份')
    }
  } catch (err: any) {
    try { candidate.close() } catch { /* ignore */ }
    throw new Error(`备份文件完整性校验失败：${err?.message || String(err)}`)
  }
  if (db) {
    try { db.close() } catch { /* ignore */ }
    db = null
  }
  db = candidate
  patchDatabase(db)
  resetTxnState()
  _flushSave()
}
