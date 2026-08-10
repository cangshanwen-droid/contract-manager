import { getDatabase } from '../connection'
import { queryAll } from '../helpers'
import type { AuditLog } from '../../../shared/types'

export interface AuditLogParams {
  username: string
  role: string
  action: string
  target: string
  target_id?: number
  old_value?: string
  new_value?: string
  ip?: string
  result?: string
}

/**
 * 写入一条审计日志记录
 */
export function insertAuditLog(params: AuditLogParams): void {
  try {
    const db = getDatabase()
    db.run(
      `INSERT INTO audit_logs (username, role, action, target, target_id, old_value, new_value, ip, result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.username,
        params.role,
        params.action,
        params.target,
        params.target_id ?? null,
        params.old_value ?? null,
        params.new_value ?? null,
        params.ip ?? null,
        params.result ?? 'success'
      ]
    )
  } catch (err) {
    // 审计日志写入失败不应影响主业务
    console.error('audit_log insert failed:', err)
  }
}

/**
 * 查询审计日志列表（支持分页）
 */
export function listAuditLogs(opts?: {
  username?: string
  action?: string
  page?: number
  pageSize?: number
}): { items: AuditLog[]; total: number } {
  const db = getDatabase()

  let where = 'WHERE 1=1'
  const params: unknown[] = []

  if (opts?.username) {
    where += ' AND username = ?'
    params.push(opts.username)
  }
  if (opts?.action) {
    where += ' AND action = ?'
    params.push(opts.action)
  }

  const countRow = queryAll(`SELECT COUNT(*) as cnt FROM audit_logs ${where}`, params)[0]
  const total = (countRow?.cnt as number) ?? 0

  const page = opts?.page ?? 1
  const pageSize = opts?.pageSize ?? 50
  const offset = (page - 1) * pageSize

  const items = queryAll(
    `SELECT * FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  ) as AuditLog[]

  return { items, total }
}
