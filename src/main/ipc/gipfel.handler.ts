import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { PERMISSIONS } from '../../shared/permissions'
import { requirePermission } from '../session'

export function registerGipfelHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GIPFEL_OPEN, () => {
    try {
      const perm = requirePermission(PERMISSIONS.STOCK_TRADE, '没有股票交易的权限')
      if (!perm.ok) return perm.response
      const win = new BrowserWindow({
        width: 1280,
        height: 800,
        title: 'Gipfel Trading Arena',
        autoHideMenuBar: true,
        webPreferences: {
          sandbox: true
        }
      })
      win.loadURL('https://www.gipfel.ltd/')
      return { success: true }
    } catch (err: any) {
      console.error('GIPFEL_OPEN failed:', err)
      return { success: false, message: `打开 Gipfel 窗口失败：${err.message || '未知错误'}` }
    }
  })
}
