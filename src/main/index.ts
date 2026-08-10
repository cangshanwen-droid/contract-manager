import { app, shell, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, saveDatabase } from './database/connection'
import { runMigrations } from './database/migrations'
import { seedDefaultData } from './database/seed'
import { registerAllHandlers } from './ipc/register-all'
import path from 'path'
import fs from 'fs'
import { TRUSTED_CERT_HOSTS } from '../shared/cloud-config'

// ── 安全 console：防止 EPIPE 崩溃（管道断开时 console 输出抛异常）──
;['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
  const orig = console[method as keyof typeof console]
  console[method as keyof typeof console] = function (...args: unknown[]): void {
    try { orig.apply(console, args) } catch { /* EPIPE 静默 */ }
  } as never
})

// 自动备份定时器
let autoBackupTimer: ReturnType<typeof setInterval> | null = null

function startAutoBackup(): void {
  const interval = 30 * 60 * 1000 // 30 分钟
  autoBackupTimer = setInterval(() => {
    try {
      // 先强制立即落盘，再复制，确保备份文件包含最新数据
      saveDatabase(true)
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

// ── 单实例锁（P0-4）：防止多开进程并发写同一 DB 文件导致数据损坏 ──
// 拿不到锁说明已有实例在运行，直接退出；主实例收到 second-instance 时聚焦已有窗口。
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Gipfel 管理系统',
    icon: join(app.getAppPath(), 'assets', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      webviewTag: false
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
  // 未获得单实例锁的进程直接退出，不执行任何初始化
  if (!gotSingleInstanceLock) return

  electronApp.setAppUserModelId('com.contract-manager.app')

  // 主实例：二次启动时聚焦已有窗口
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // 信任自签名证书（仅限 Gipfel 云端主机；其他域证书错误仍拦截）
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    const host = request.hostname
    const trusted = TRUSTED_CERT_HOSTS.some(h => host === h || host.endsWith(`.${h}`))
    if (trusted) {
      callback(0)
    } else {
      callback(-3)
    }
  })

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
  saveDatabase(true)
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
