import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, saveDatabase } from './database/connection'
import { runMigrations } from './database/migrations'
import { seedDefaultData } from './database/seed'
import { registerAllHandlers } from './ipc/register-all'
import { saveDatabase } from './database/connection'
import path from 'path'
import fs from 'fs'

// 自动备份定时器
let autoBackupTimer: ReturnType<typeof setInterval> | null = null

function startAutoBackup(): void {
  const interval = 30 * 60 * 1000 // 30 分钟
  autoBackupTimer = setInterval(() => {
    try {
      saveDatabase()
      const dbPath = path.join(app.getPath('userData'), 'contract-manager.db')
      if (!fs.existsSync(dbPath)) return
      const backupDir = path.join(app.getPath('userData'), 'backups')
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true })
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const backupPath = path.join(backupDir, `auto-backup-${timestamp}.db`)
      fs.copyFileSync(dbPath, backupPath)

      // 保留最近 10 个
      const files = fs.readdirSync(backupDir)
        .filter((f) => f.startsWith('auto-backup-') && f.endsWith('.db'))
        .sort()
        .reverse()
      for (const oldFile of files.slice(10)) {
        fs.unlinkSync(path.join(backupDir, oldFile))
      }
      console.log(`Auto backup: ${backupPath}`)
    } catch (err) {
      console.error('Auto backup failed:', err)
    }
  }, interval)
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: join(app.getAppPath(), 'assets', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 捕获渲染进程控制台错误
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log(`[RENDERER ERROR] ${message}`)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev) {
    mainWindow.webContents.openDevTools()
    if (process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.contract-manager.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 初始化数据库
  await initDatabase()
  runMigrations()
  seedDefaultData()

  // 注册 IPC
  registerAllHandlers()

  // 启动自动备份
  startAutoBackup()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (autoBackupTimer) clearInterval(autoBackupTimer)
  saveDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
