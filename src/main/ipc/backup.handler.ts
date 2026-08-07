import { ipcMain, app, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { IPC_CHANNELS } from '../../shared/constants'
import { saveDatabase } from '../database/connection'

export function registerBackupHandlers(): void {
  // 数据库信息
  ipcMain.handle(IPC_CHANNELS.DB_INFO, () => {
    const dbPath = path.join(app.getPath('userData'), 'contract-manager.db')
    let size = 0
    try {
      if (fs.existsSync(dbPath)) size = fs.statSync(dbPath).size
    } catch { /* ignore */ }
    return {
      path: dbPath,
      size,
      size_formatted:
        size > 1024 * 1024
          ? (size / (1024 * 1024)).toFixed(1) + ' MB'
          : (size / 1024).toFixed(0) + ' KB'
    }
  })

  // 手动备份
  ipcMain.handle(IPC_CHANNELS.DB_BACKUP, async () => {
    try {
      saveDatabase()
      const dbPath = path.join(app.getPath('userData'), 'contract-manager.db')
      if (!fs.existsSync(dbPath)) {
        return { success: false, message: '数据库文件不存在' }
      }
      const result = await dialog.showSaveDialog({
        title: '选择备份位置',
        defaultPath: `Gipfel备份_${new Date().toISOString().slice(0, 10)}.db`,
        filters: [{ name: '数据库文件', extensions: ['db'] }]
      })
      if (result.canceled) return { success: false, message: '已取消' }
      fs.copyFileSync(dbPath, result.filePath!)
      return { success: true, path: result.filePath }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  })

  // 自动备份到 appData 下的 backups 目录
  ipcMain.handle(IPC_CHANNELS.DB_AUTO_BACKUP, () => {
    try {
      saveDatabase()
      const dbPath = path.join(app.getPath('userData'), 'contract-manager.db')
      if (!fs.existsSync(dbPath)) {
        return { success: false, message: '数据库文件不存在' }
      }
      const backupDir = path.join(app.getPath('userData'), 'backups')
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true })
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const backupPath = path.join(backupDir, `auto-backup-${timestamp}.db`)
      fs.copyFileSync(dbPath, backupPath)

      // 保留最近 10 个自动备份，删除旧的
      const files = fs.readdirSync(backupDir)
        .filter((f) => f.startsWith('auto-backup-') && f.endsWith('.db'))
        .sort()
        .reverse()
      for (const oldFile of files.slice(10)) {
        fs.unlinkSync(path.join(backupDir, oldFile))
      }

      return { success: true, path: backupPath }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  })
}
