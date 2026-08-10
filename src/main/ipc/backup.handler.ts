import { ipcMain, app, dialog, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { IPC_CHANNELS } from '../../shared/constants'
import { PERMISSIONS } from '../../shared/permissions'
import { saveDatabase, restoreDatabaseFromFile } from '../database/connection'
import { requirePermission } from '../session'

export function registerBackupHandlers(): void {
  // 数据库信息
  ipcMain.handle(IPC_CHANNELS.DB_INFO, () => {
    try {
      const perm = requirePermission(PERMISSIONS.SYSTEM_CONFIG)
      if (!perm.ok) return perm.response
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
    } catch (err: any) {
      console.error('DB_INFO failed:', err)
      return { success: false, message: `获取数据库信息失败：${err.message || '未知错误'}` }
    }
  })

  // 手动备份
  ipcMain.handle(IPC_CHANNELS.DB_BACKUP, async () => {
    try {
      const perm = requirePermission(PERMISSIONS.SYSTEM_CONFIG, '没有系统设置的权限')
      if (!perm.ok) return perm.response
      saveDatabase(true)
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
      console.error('DB_BACKUP failed:', err)
      return { success: false, message: `备份失败：${err.message || '未知错误'}` }
    }
  })

  // 一键备份到桌面（带时间戳，无需选择位置）
  ipcMain.handle(IPC_CHANNELS.DB_BACKUP_TO_DESKTOP, async () => {
    try {
      const perm = requirePermission(PERMISSIONS.SYSTEM_CONFIG, '没有系统设置的权限')
      if (!perm.ok) return perm.response
      saveDatabase(true)
      const dbPath = path.join(app.getPath('userData'), 'contract-manager.db')
      if (!fs.existsSync(dbPath)) {
        return { success: false, message: '数据库文件不存在' }
      }
      const desktopDir = app.getPath('desktop')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const fileName = `Gipfel备份_${timestamp}.db`
      const targetPath = path.join(desktopDir, fileName)
      fs.copyFileSync(dbPath, targetPath)
      return { success: true, path: targetPath, fileName }
    } catch (err: any) {
      console.error('DB_BACKUP_TO_DESKTOP failed:', err)
      return { success: false, message: `备份失败：${err.message || '未知错误'}` }
    }
  })

  // 恢复数据库：选择 .db 备份文件，覆盖当前数据
  // 注意：渲染端已弹出确认框（警告覆盖），此处直接执行
  ipcMain.handle(IPC_CHANNELS.DB_RESTORE, async () => {
    try {
      const perm = requirePermission(PERMISSIONS.SYSTEM_CONFIG, '没有系统设置的权限')
      if (!perm.ok) return perm.response
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { success: false, message: '无活动窗口' }

      const result = await dialog.showOpenDialog(win, {
        title: '选择要恢复的数据库备份',
        filters: [{ name: '数据库备份文件', extensions: ['db'] }],
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, message: '已取消' }
      }
      const filePath = result.filePaths[0]
      if (!fs.existsSync(filePath)) {
        return { success: false, message: '文件不存在' }
      }
      // 先把当前内存数据落盘，再整体替换（防止恢复失败时丢失最近写入）
      saveDatabase(true)
      restoreDatabaseFromFile(filePath)
      return { success: true, path: filePath }
    } catch (err: any) {
      console.error('DB_RESTORE failed:', err)
      return { success: false, message: `恢复失败：${err.message || '未知错误'}（请确认所选文件是有效的数据库备份）` }
    }
  })

  // 自动备份到 appData 下的 backups 目录
  ipcMain.handle(IPC_CHANNELS.DB_AUTO_BACKUP, () => {
    try {
      const perm = requirePermission(PERMISSIONS.SYSTEM_CONFIG, '没有系统设置的权限')
      if (!perm.ok) return perm.response
      saveDatabase(true)
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
      console.error('DB_AUTO_BACKUP failed:', err)
      return { success: false, message: `自动备份失败：${err.message || '未知错误'}` }
    }
  })
}
