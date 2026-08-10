import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as XLSX from 'xlsx'
import { IPC_CHANNELS } from '../../shared/constants'
import { PERMISSIONS } from '../../shared/permissions'
import { getDatabase } from '../database/connection'
import { queryAll } from '../database/helpers'
import { requirePermission } from '../session'

// 导出表名映射（同时作为 SQL 注入防护的白名单）
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

// 允许导出的表名集合（白名单）
const ALLOWED_TABLES = new Set(Object.keys(TABLE_LABELS))

function isAllowedTable(name: string): name is string {
  return ALLOWED_TABLES.has(name)
}

// 单表导出核心逻辑：将指定表写入 Excel 并弹出保存对话框
async function exportTablesToExcel(tables: string[], defaultName: string): Promise<unknown> {
  const validTables = tables.filter(isAllowedTable)
  if (validTables.length === 0) {
    return { success: false, message: '没有可导出的有效数据表' }
  }

  const wb = XLSX.utils.book_new()

  for (const table of validTables) {
    // table 已经过白名单校验，安全拼接
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
    defaultPath: `${defaultName}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }]
  })

  if (result.canceled) return { success: false, message: '已取消' }

  XLSX.writeFile(wb, result.filePath!)
  return { success: true, path: result.filePath }
}

export function registerExcelHandlers(): void {
  // Excel 导出
  ipcMain.handle(IPC_CHANNELS.EXCEL_EXPORT, async (_e, tables?: string[]) => {
    try {
      const perm = requirePermission(PERMISSIONS.SYSTEM_CONFIG, '没有导出数据的权限')
      if (!perm.ok) return perm.response
      const exportTables = tables ?? Object.keys(TABLE_LABELS)
      return await exportTablesToExcel(exportTables, 'Gipfel数据导出')
    } catch (err: any) {
      console.error('EXCEL_EXPORT failed:', err)
      return { success: false, message: `导出失败：${err.message || '未知错误'}` }
    }
  })

  // 导出合同表
  ipcMain.handle(IPC_CHANNELS.EXCEL_EXPORT_CONTRACTS, async () => {
    try {
      const perm = requirePermission(PERMISSIONS.SYSTEM_CONFIG, '没有导出数据的权限')
      if (!perm.ok) return perm.response
      return await exportTablesToExcel(['contracts'], '合同表')
    } catch (err: any) {
      console.error('EXCEL_EXPORT_CONTRACTS failed:', err)
      return { success: false, message: `导出合同表失败：${err.message || '未知错误'}` }
    }
  })

  // 导出区域表
  ipcMain.handle(IPC_CHANNELS.EXCEL_EXPORT_REGIONS, async () => {
    try {
      const perm = requirePermission(PERMISSIONS.SYSTEM_CONFIG, '没有导出数据的权限')
      if (!perm.ok) return perm.response
      return await exportTablesToExcel(['regions'], '区域表')
    } catch (err: any) {
      console.error('EXCEL_EXPORT_REGIONS failed:', err)
      return { success: false, message: `导出区域表失败：${err.message || '未知错误'}` }
    }
  })

  // 导出账户流水表
  ipcMain.handle(IPC_CHANNELS.EXCEL_EXPORT_ACCOUNT_TRANSACTIONS, async () => {
    try {
      const perm = requirePermission(PERMISSIONS.SYSTEM_CONFIG, '没有导出数据的权限')
      if (!perm.ok) return perm.response
      return await exportTablesToExcel(['account_transactions'], '账户流水表')
    } catch (err: any) {
      console.error('EXCEL_EXPORT_ACCOUNT_TRANSACTIONS failed:', err)
      return { success: false, message: `导出账户流水表失败：${err.message || '未知错误'}` }
    }
  })

  // Excel 导入
  ipcMain.handle(IPC_CHANNELS.EXCEL_IMPORT, async (_e) => {
    try {
      const perm = requirePermission(PERMISSIONS.SYSTEM_CONFIG, '没有导入数据的权限')
      if (!perm.ok) return perm.response
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

        // 白名单二次校验，防止 SQL 注入
        if (!isAllowedTable(table)) {
          errors.push(`不允许导入的表: ${table}`)
          continue
        }

        const ws = wb.Sheets[sheetName]
        const data = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]

        if (data.length === 0) continue

        // 获取列名（排除自动计算列和ID列）- table 已通过白名单校验
        const tableInfo = db.exec(`PRAGMA table_info(${table})`)
        if (!tableInfo.length) continue

        const allColumns = tableInfo[0].values.map((v) => v[1] as string)
        const autoColumns = new Set(['id', 'created_at', 'updated_at',
          'amount', 'total_land_area', 'tax_amount', 'total',
          'calculated_at', 'applied_at'])
        const columns = allColumns.filter((c) => !autoColumns.has(c))

        // 白名单校验列名：只允许数据库中实际存在的列
        const columnSet = new Set(allColumns)

        for (const row of data) {
          // 过滤并校验每一行的列名
          const validCols: string[] = []
          const validValues: unknown[] = []
          for (const col of columns) {
            if (columnSet.has(col)) {
              validCols.push(col)
              validValues.push(row[col] ?? null)
            }
          }

          const placeholders = validCols.map(() => '?').join(', ')
          const colNames = validCols.join(', ')

          try {
            // table 和 colNames 均已通过白名单校验
            db.run(
              `INSERT OR IGNORE INTO ${table} (${colNames}) VALUES (${placeholders})`,
              validValues as any[]
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
      console.error('EXCEL_IMPORT failed:', err)
      return { success: false, message: `导入失败：${err.message || '未知错误'}` }
    }
  })
}
