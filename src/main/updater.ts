/**
 * 自动更新（v1.3.0 新增）
 *
 * 设计原则（克制）：
 * - 启动 8s 后静默检查一次，不阻塞启动、不弹窗打扰
 * - 发现新版本：静默下载 → 主窗口提示「新版本已就绪，重启安装」
 * - 失败静默降级（日志记录，不打扰用户）
 * - 仅打包后（app.isPackaged）启用；开发模式跳过
 */
import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { log as electronLog } from 'electron-log'

autoUpdater.logger = electronLog
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

let notified = false

function notifyReady(): void {
  if (notified) return
  notified = true
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    dialog.showMessageBox(win, {
      type: 'info',
      title: '发现新版本',
      message: '新版本已下载完成，重启后生效',
      detail: '点击「立即重启」完成更新（数据已自动保存，不受影响）',
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        setImmediate(() => {
          autoUpdater.quitAndInstall()
        })
      }
    }).catch(() => { /* 对话框失败静默 */ })
  }
}

export function initAutoUpdater(): void {
  if (!app.isPackaged) return
  // 启动后延迟检查，避免影响首屏
  setTimeout(() => {
    autoUpdater.on('update-downloaded', notifyReady)
    autoUpdater.on('error', () => { /* 静默降级：更新失败不影响使用 */ })
    autoUpdater.checkForUpdates().catch(() => { /* 网络失败静默 */ })
  }, 8000)
}
