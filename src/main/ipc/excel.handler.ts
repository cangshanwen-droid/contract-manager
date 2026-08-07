import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import * as XLSX from 'xlsx'
import { IPC_CHANNELS } from '../../shared/constants'
import { getDatabase } from '../database/connection'
import { queryAll } from '../database/helpers'

// 导出表名映射
const TABLE_LABELS: Record<string, string> = {
  regions: '区域',
  companies: '公司',
  contracts: '合同',
  contract_items: '合同明细',
  contract_types: '合同类型',
  infrastructure_types: '基建类型',
  formula_logs: '模拟日志',
  region_accounts: '财务账户',
  account_transactions: '交易流水'
}

export function registerExcelHandlers(): void {
  // Excel 导出
  ipcMain.handle(IPC_CHANNELS.EXCEL_EXPORT, async (_e, tables?: string[]) => {
    try {
      const exportTables = tables ?? Object.keys(TABLE_LABELS)
      const wb = XLSX.utils.book_new()

      for (const table of exportTables) {
        const rows = queryAll(`SELECT * FROM ${table}`)
        if (rows.length === 0) continue
        const ws = XLSX.utils.json_to_sheet(rows as any[])
        const sheetName = TABLE_LABELS[table] ?? table
        XLSX.utils.book_append_sheet(wb, ws, sheetName)
      }

      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { success: false, message: '无活动窗口' }

      const result = await dialog.showSaveDialog(win, {
        title: '导出 Excel',
        defaultPath: `Gipfel数据导出_${new Date().toISOString().slice(0, 10)}.xlsx`,
        filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }]
      })

      if (result.canceled) return { success: false, message: '已取消' }

      XLSX.writeFile(wb, result.filePath!)
      return { success: true, path: result.filePath }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  })

  // Excel 导入
  ipcMain.handle(IPC_CHANNELS.EXCEL_IMPORT, async (_e) => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { success: false, message: '无活动窗口' }

      const result = await dialog.showOpenDialog(win, {
        title: '导入 Excel',
        filters: [{ name: 'Excel 文件', extensions: ['xlsx', 'xls'] }],
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: '已取消' }
      }

      const wb = XLSX.readFile(result.filePaths[0])
      const db = getDatabase()
      const imported: string[] = []
      const errors: string[] = []

      for (const sheetName of wb.SheetNames) {
        const table = Object.entries(TABLE_LABELS).find(([, label]) => label === sheetName)?.[0]
        if (!table) {
          errors.push(`未知工作表: ${sheetName}，已跳过`)
          continue
        }

        const ws = wb.Sheets[sheetName]
        const data = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]

        if (data.length === 0) continue

        // 获取列名（排除自动计算列和ID列）
        const tableInfo = db.exec(`PRAGMA table_info(${table})`)
        if (!tableInfo.length) continue

        const allColumns = tableInfo[0].values.map((v) => v[1] as string)
        const autoColumns = new Set(['id', 'created_at', 'updated_at',
          'amount', 'total_land_area', 'tax_amount', 'total',
          'calculated_at', 'applied_at'])
        const columns = allColumns.filter((c) => !autoColumns.has(c))

        for (const row of data) {
          const values = columns.map((col) => row[col] ?? null)
          const placeholders = columns.map(() => '?').join(', ')
          const colNames = columns.join(', ')

          try {
            db.run(
              `INSERT OR IGNORE INTO ${table} (${colNames}) VALUES (${placeholders})`,
              values as any[]
            )
          } catch (err: any) {
            errors.push(`${sheetName}: ${err.message}`)
          }
        }
        imported.push(sheetName)
      }

      return {
        success: true,
        imported,
        errors: errors.length > 0 ? errors : undefined,
        message: `成功导入 ${imported.length} 个工作表` + (errors.length > 0 ? `，${errors.length} 个错误` : '')
      }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  })
}
