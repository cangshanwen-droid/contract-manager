import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { PERMISSIONS } from '../../shared/permissions'
import { getDatabase } from '../database/connection'
import { queryAll, queryOne } from '../database/helpers'
import { insertAuditLog } from '../database/repositories/audit.repo'
import { notificationRepo } from '../database/repositories/notification.repo'
import { requirePermission } from '../session'

export function registerAccountHandlers(): void {
  // 创建账户
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_CREATE, (_e, data: {
    region_id: number; account_name: string; is_master?: number; initial_balance?: number
    _operator?: string; _operatorRole?: string
  }) => {
    try {
      const perm = requirePermission(PERMISSIONS.ACCOUNT_CREATE, '没有新建账户的权限')
      if (!perm.ok) return perm.response
      const db = getDatabase()
      db.run(
        'INSERT INTO region_accounts (region_id, account_name, is_master, balance) VALUES (?, ?, ?, ?)',
        [data.region_id, data.account_name, data.is_master ?? 0, data.initial_balance ?? 0]
      )
      const id = (queryOne as any)('SELECT last_insert_rowid() as id') as { id: number }
      insertAuditLog({
        username: data._operator || 'system',
        role: data._operatorRole || 'admin',
        action: 'create',
        target: 'account',
        target_id: id?.id,
        new_value: JSON.stringify({ account_name: data.account_name, region_id: data.region_id }),
        result: 'success'
      })
      return { success: true, id: id?.id }
    } catch (err: any) {
      console.error('ACCOUNT_CREATE failed:', err)
      return { success: false, message: `创建账户失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.ACCOUNT_LIST, () => {
    try {
      const perm = requirePermission(PERMISSIONS.ACCOUNT_VIEW)
      if (!perm.ok) return perm.response
      return queryAll(`
        SELECT a.*, r.name as region_name
        FROM region_accounts a
        LEFT JOIN regions r ON r.id = a.region_id
        ORDER BY a.is_master DESC, a.region_id
      `)
    } catch (err: any) {
      console.error('ACCOUNT_LIST failed:', err)
      return { success: false, message: `获取账户列表失败：${err.message || '未知错误'}` }
    }
  })

  // 获取单个账户
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_GET, (_e, id: number) => {
    try {
      const perm = requirePermission(PERMISSIONS.ACCOUNT_VIEW)
      if (!perm.ok) return perm.response
      return queryOne(`
        SELECT a.*, r.name as region_name
        FROM region_accounts a
        LEFT JOIN regions r ON r.id = a.region_id
        WHERE a.id = ?
      `, [id])
    } catch (err: any) {
      console.error('ACCOUNT_GET failed:', err)
      return { success: false, message: `获取账户详情失败：${err.message || '未知错误'}` }
    }
  })

  // 获取交易流水
  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_TRANSACTIONS,
    (_e, accountId: number, fiscalYear?: number) => {
      try {
        const perm = requirePermission(PERMISSIONS.ACCOUNT_VIEW)
        if (!perm.ok) return perm.response
        let sql = 'SELECT * FROM account_transactions WHERE account_id = ?'
        const params: unknown[] = [accountId]
        if (fiscalYear) {
          sql += ' AND fiscal_year = ?'
          params.push(fiscalYear)
        }
        sql += ' ORDER BY created_at DESC'
        return queryAll(sql, params)
      } catch (err: any) {
        console.error('ACCOUNT_TRANSACTIONS failed:', err)
        return { success: false, message: `获取交易流水失败：${err.message || '未知错误'}` }
      }
    }
  )

  // 添加交易 — 使用事务确保 INSERT + UPDATE 原子性
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_ADD_TRANSACTION, (_e, data: {
    account_id: number
    trans_type: 'income' | 'expense'
    category?: string
    amount: number
    description?: string
    fiscal_year?: number
    operator?: string
    contract_id?: number
    source_type?: string
    _operatorRole?: string
  }) => {
    const db = getDatabase()
    try {
      // 后端权限校验：资金交易需要 account.transact
      const perm = requirePermission(PERMISSIONS.ACCOUNT_TRANSACT, '没有资金交易的权限')
      if (!perm.ok) return perm.response
      db.run('BEGIN TRANSACTION')

      db.run(
        `INSERT INTO account_transactions (account_id, trans_type, category, amount, description, fiscal_year, operator, contract_id, source_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.account_id, data.trans_type, data.category ?? '', data.amount, data.description ?? '', data.fiscal_year ?? null, data.operator ?? '', data.contract_id ?? null, data.source_type ?? 'manual']
      )
      const sign = data.trans_type === 'income' ? 1 : -1
      db.run(
        `UPDATE region_accounts SET balance = balance + ?, updated_at = datetime('now','localtime') WHERE id = ?`,
        [sign * data.amount, data.account_id]
      )

      db.run('COMMIT')

      // 审计日志
      insertAuditLog({
        username: data.operator || 'system',
        role: (data as any)._operatorRole || 'operator',
        action: data.trans_type === 'income' ? 'income' : 'expense',
        target: 'transaction',
        target_id: data.account_id,
        new_value: JSON.stringify({
          trans_type: data.trans_type,
          amount: data.amount,
          category: data.category,
          description: data.description,
          contract_id: data.contract_id
        }),
        result: 'success'
      })

      // 通知中心：账户交易 → 通知账户管理人员
      try {
        notificationRepo.notifyTransaction(
          data.account_id,
          data.trans_type,
          data.amount,
          data.description,
          data.category
        )
      } catch (err) {
        console.error('notification trigger failed:', err)
      }

      return { success: true }
    } catch (err: any) {
      try { db.run('ROLLBACK') } catch { /* ignore rollback errors */ }
      console.error('ACCOUNT_ADD_TRANSACTION failed:', err)
      return { success: false, message: `添加交易失败：${err.message || '未知错误'}` }
    }
  })

  // 账户汇总
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_SUMMARY, () => {
    try {
      const perm = requirePermission(PERMISSIONS.ACCOUNT_VIEW)
      if (!perm.ok) return perm.response
      const accounts = queryAll(`
        SELECT a.*, r.name as region_name
        FROM region_accounts a
        LEFT JOIN regions r ON r.id = a.region_id
        ORDER BY a.is_master DESC, a.region_id
      `) as Array<Record<string, unknown>>
      const totalBalance = accounts.reduce((s, a) => s + ((a.balance as number) || 0), 0)
      const regionCount = accounts.filter((a) => !a.is_master).length
      return { accounts, total_balance: totalBalance, region_count: regionCount }
    } catch (err: any) {
      console.error('ACCOUNT_SUMMARY failed:', err)
      return { success: false, message: `获取账户汇总失败：${err.message || '未知错误'}` }
    }
  })
}
