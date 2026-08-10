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

// ── 崩溃恢复（P0-3）────────────────────────────────────────────
// 内部应用策略：不弹崩溃对话框打扰用户，静默记录 + 自动恢复。

/** 崩溃日志路径：userData/crash.log */
function getCrashLogPath(): string {
  return path.join(app.getPath('userData'), 'crash.log')
}

function writeCrashLog(entry: string): void {
  try {
    const p = getCrashLogPath()
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${entry}\n`)
  } catch { /* 日志写入失败静默（如磁盘满） */ }
}

// 主进程未捕获异常/未处理拒绝：记录日志，不终止（内部应用，避免直接闪退）
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err)
  writeCrashLog(`uncaughtException: ${err?.stack || err?.message || String(err)}`)
})
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
  writeCrashLog(`unhandledRejection: ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`)
})

// 渲染进程崩溃自动恢复：非用户主动关闭时自动 reload（最多 2 次）
app.on('web-contents-created', (_event, contents) => {
  let reloadCount = 0
  contents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return // 用户主动关闭窗口，不恢复
    if (contents.isDestroyed()) return
    console.warn(`[render-process-gone] reason=${details.reason} exitCode=${details.exitCode} reload=${reloadCount}/2`)
    writeCrashLog(`render-process-gone: reason=${details.reason} exitCode=${details.exitCode} reload=${reloadCount}/2`)
    if (reloadCount >= 2) {
      console.error('[render-process-gone] 自动恢复已达上限（2 次），不再重载')
      return
    }
    reloadCount += 1
    // 延迟 500ms 等资源释放后再重载
    setTimeout(() => {
      if (!contents.isDestroyed()) {
        console.warn(`[render-process-gone] 自动 reload 渲染进程（第 ${reloadCount}/2 次）`)
        contents.reload()
      }
    }, 500)
  })
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

  // 窗口打开拦截：仅允许打开受信任主机的 https 链接（安全审计 P0-D 修复）
  // 白名单：云端主机 106.54.26.86 与 gipfel.duckdns.org（含其子域），其余一律拒绝。
  // 用 URL.hostname 精确匹配而非 startsWith，防止 106.54.26.86.evil.com 之类前缀伪造。
  const TRUSTED_OPEN_HOSTS = [...TRUSTED_CERT_HOSTS, 'gipfel.duckdns.org']
  mainWindow.webContents.setWindowOpenHandler((details) => {
    const url = details.url
    let allowed = false
    try {
      const u = new URL(url)
      allowed = u.protocol === 'https:' &&
        TRUSTED_OPEN_HOSTS.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`))
    } catch { /* 非 URL 一律拒绝 */ }
    if (allowed) {
      shell.openExternal(url)
    } else {
      console.warn(`[window-open] 已拦截非受信链接: ${url.slice(0, 80)}`)
    }
    return { action: 'deny' }
  })

  // 导航拦截：禁止渲染进程导航到任意外部页面（安全审计 P0-1）
  // 防止 XSS 后 location.href 跳到恶意站点并携带 preload 桥
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith('file://') || url.startsWith('http://localhost') ||
      url.startsWith('https://106.54.26.86') || url.startsWith('http://106.54.26.86')
    if (!allowed) {
      console.warn(`[will-navigate] 已拦截导航: ${url.slice(0, 80)}`)
      event.preventDefault()
    }
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
