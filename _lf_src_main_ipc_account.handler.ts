import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { PERMISSIONS } from '../../shared/permissions'
import { getDatabase } from '../database/connection'
import { queryAll, queryOne } from '../database/helpers'
import { insertAuditLog } from '../database/repositories/audit.repo'
import { notificationRepo } from '../database/repositories/notification.repo'
import { requirePermission, auditIdentity } from '../session'

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
      // P1-3：初始余额不允许为负（负数余额会破坏资金链路一致性）
      const initialBalance = Number(data.initial_balance ?? 0)
      if (!Number.isFinite(initialBalance) || initialBalance < 0) {
        return { success: false, message: '初始余额必须为不小于 0 的数字' }
      }
      db.run(
        'INSERT INTO region_accounts (region_id, account_name, is_master, balance) VALUES (?, ?, ?, ?)',
        [data.region_id, data.account_name, data.is_master ?? 0, initialBalance]
      )
      const id = (queryOne as any)('SELECT last_insert_rowid() as id') as { id: number }
      // P1-7 审计归属可信化：操作者取自主进程会话，忽略渲染进程透传的 _operator/_operatorRole
      const operator = auditIdentity()
      insertAuditLog({
        username: operator.username,
        role: operator.role,
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

  // 获取全部流水年度（年度筛选下拉动态化）
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_YEARS, () => {
    try {
      const perm = requirePermission(PERMISSIONS.ACCOUNT_VIEW)
      if (!perm.ok) return perm.response
      const rows = queryAll(
        'SELECT DISTINCT fiscal_year FROM account_transactions WHERE fiscal_year IS NOT NULL ORDER BY fiscal_year DESC'
      ) as { fiscal_year: number }[]
      return rows.map(r => r.fiscal_year)
    } catch (err: any) {
      console.error('ACCOUNT_YEARS failed:', err)
      return { success: false, message: `获取流水年度失败：${err.message || '未知错误'}` }
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

  // 添加交易 - 使用事务确保 INSERT + UPDATE 原子性
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

      // P1-3：交易类型与金额校验——amount 必须为正数且有上限，杜绝负金额/零金额刷流水
      if (data.trans_type !== 'income' && data.trans_type !== 'expense') {
        return { success: false, message: `非法交易类型：${String(data.trans_type)}（仅支持 income / expense）` }
      }
      const amount = Number(data.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return { success: false, message: '交易金额必须为大于 0 的数字' }
      }
      if (amount > 100000000) {
        return { success: false, message: '交易金额不能超过 100000000' }
      }

      db.run('BEGIN TRANSACTION')

      // P1-3：支出前在事务内校验余额，不足则回滚并返回「余额不足」，不允许余额为负
      const account = queryOne(
        'SELECT id, balance FROM region_accounts WHERE id = ?',
        [data.account_id]
      ) as { id: number; balance: number } | null
      if (!account) {
        db.run('ROLLBACK')
        return { success: false, message: '账户不存在' }
      }
      if (data.trans_type === 'expense' && (Number(account.balance) || 0) < amount) {
        db.run('ROLLBACK')
        return { success: false, message: `余额不足：账户余额 ${(Number(account.balance) || 0).toFixed(2)}` }
      }

      db.run(
        `INSERT INTO account_transactions (account_id, trans_type, category, amount, description, fiscal_year, operator, contract_id, source_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.account_id, data.trans_type, data.category ?? '', amount, data.description ?? '', data.fiscal_year ?? null, auditIdentity().username, data.contract_id ?? null, data.source_type ?? 'manual']
      )
      const sign = data.trans_type === 'income' ? 1 : -1
      db.run(
        `UPDATE region_accounts SET balance = balance + ?, updated_at = datetime('now','localtime') WHERE id = ?`,
        [sign * amount, data.account_id]
      )

      db.run('COMMIT')

      // 审计日志（P1-7：操作者取自主进程会话，忽略渲染进程透传的 operator/_operatorRole）
      const operator = auditIdentity()
      insertAuditLog({
        username: operator.username,
        role: operator.role,
        action: data.trans_type === 'income' ? 'income' : 'expense',
        target: 'transaction',
        target_id: data.account_id,
        new_value: JSON.stringify({
          trans_type: data.trans_type,
          amount,
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
          amount,
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
