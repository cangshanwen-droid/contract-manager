import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'

export function registerGipfelHandlers(): void {
  ipcMain.handle('open-gipfel-window', () => {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      title: 'Gipfel Trading Arena',
      autoHideMenuBar: true,
      webPreferences: {
        sandbox: false
      }
    })
    win.loadURL('https://www.gipfel.ltd/')
    return { success: true }
  })
}
