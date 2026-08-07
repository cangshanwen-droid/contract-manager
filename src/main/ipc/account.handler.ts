import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { getDatabase } from '../database/connection'
import { queryAll, queryOne } from '../database/helpers'

export function registerAccountHandlers(): void {
  // 列出所有账户
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_LIST, () => {
    return queryAll(`
      SELECT a.*, r.name as region_name
      FROM region_accounts a
      LEFT JOIN regions r ON r.id = a.region_id
      ORDER BY a.is_master DESC, a.region_id
    `)
  })

  // 获取单个账户
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_GET, (_e, id: number) => {
    return queryOne(`
      SELECT a.*, r.name as region_name
      FROM region_accounts a
      LEFT JOIN regions r ON r.id = a.region_id
      WHERE a.id = ?
    `, [id])
  })

  // 获取交易流水
  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_TRANSACTIONS,
    (_e, accountId: number, fiscalYear?: number) => {
      let sql = 'SELECT * FROM account_transactions WHERE account_id = ?'
      const params: unknown[] = [accountId]
      if (fiscalYear) {
        sql += ' AND fiscal_year = ?'
        params.push(fiscalYear)
      }
      sql += ' ORDER BY created_at DESC'
      return queryAll(sql, params)
    }
  )

  // 添加交易
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_ADD_TRANSACTION, (_e, data: {
    account_id: number
    trans_type: 'income' | 'expense'
    category?: string
    amount: number
    description?: string
    fiscal_year?: number
  }) => {
    const db = getDatabase()
    db.run(
      `INSERT INTO account_transactions (account_id, trans_type, category, amount, description, fiscal_year)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.account_id, data.trans_type, data.category ?? '', data.amount, data.description ?? '', data.fiscal_year ?? null]
    )
    const sign = data.trans_type === 'income' ? 1 : -1
    db.run(
      `UPDATE region_accounts SET balance = balance + ?, updated_at = datetime('now','localtime') WHERE id = ?`,
      [sign * data.amount, data.account_id]
    )
    return { success: true }
  })

  // 账户汇总
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_SUMMARY, () => {
    const accounts = queryAll(`
      SELECT a.*, r.name as region_name
      FROM region_accounts a
      LEFT JOIN regions r ON r.id = a.region_id
      ORDER BY a.is_master DESC, a.region_id
    `) as Array<Record<string, unknown>>
    const totalBalance = accounts.reduce((s, a) => s + ((a.balance as number) || 0), 0)
    const regionCount = accounts.filter((a) => !a.is_master).length
    return { accounts, total_balance: totalBalance, region_count: regionCount }
  })
}
