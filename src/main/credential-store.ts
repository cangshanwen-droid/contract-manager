/**
 * credential-store.ts - 凭据安全存储（主进程专用）
 *
 * 安全审计 P1-7 修复：
 *  1. 登录凭据（用户名/密码）：不再由渲染进程写入 localStorage 明文，
 *     改由主进程用 Electron safeStorage 加密（Windows=DPAPI / macOS=Keychain /
 *     Linux=libsecret）后写入 userData/credentials.enc。
 *     safeStorage 不可用时（isEncryptionAvailable() === false）降级为明文文件
 *     并返回 warning，由调用方提示用户。
 *  2. 管理端密钥 adminKey：优先环境变量 GIPFEL_ADMIN_KEY，其次读取
 *     userData/admin-key.txt（若存在）。两者都无则返回 null -- 绝不硬编码，
 *     更不进入渲染进程包。
 */
import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

const CREDENTIALS_FILE = 'credentials.enc'
const ADMIN_KEY_FILE = 'admin-key.txt'

export interface StoredCredentials {
  username: string
  password: string
}

export interface SetCredentialsResult {
  success: boolean
  encrypted: boolean
  warning?: string
  message?: string
}

function credentialsPath(): string {
  return path.join(app.getPath('userData'), CREDENTIALS_FILE)
}

export function adminKeyPath(): string {
  return path.join(app.getPath('userData'), ADMIN_KEY_FILE)
}

/** 是否可用系统级安全存储（Windows=DPAPI） */
export function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/**
 * 保存凭据：safeStorage 加密 → credentials.enc（base64）。
 * safeStorage 不可用时降级为明文 JSON 文件并返回 warning。
 */
export function setCredentials(username: string, password: string): SetCredentialsResult {
  try {
    const dir = app.getPath('userData')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const file = credentialsPath()

    if (isEncryptionAvailable()) {
      const buf = safeStorage.encryptString(JSON.stringify({ username, password }))
      fs.writeFileSync(file, buf.toString('base64'), { encoding: 'utf-8', mode: 0o600 })
      return { success: true, encrypted: true }
    }

    // 降级：明文文件 + 告警（Windows 无 DPAPI 等极端环境）
    fs.writeFileSync(
      file,
      JSON.stringify({ username, password, plain: true }),
      { encoding: 'utf-8', mode: 0o600 }
    )
    return {
      success: true,
      encrypted: false,
      warning: '系统安全存储不可用（safeStorage），凭据已降级为明文保存，请注意本机环境安全',
    }
  } catch (e: any) {
    console.error('setCredentials failed:', e)
    return { success: false, encrypted: false, message: `凭据保存失败：${e?.message || '未知错误'}` }
  }
}

/** 明文降级格式解析（{plain:true}） */
function parsePlain(raw: string): StoredCredentials | null {
  try {
    const obj = JSON.parse(raw)
    if (obj && obj.plain && obj.username != null && obj.password != null) {
      return { username: String(obj.username), password: String(obj.password) }
    }
  } catch {
    /* 非 JSON 明文格式 */
  }
  return null
}

/** 尝试用 safeStorage 解密 base64 内容 */
function decryptCredentials(raw: string): StoredCredentials | null {
  if (!isEncryptionAvailable()) return null
  try {
    const decrypted = safeStorage.decryptString(Buffer.from(raw, 'base64'))
    const obj = JSON.parse(decrypted)
    if (obj && obj.username != null && obj.password != null) {
      return { username: String(obj.username), password: String(obj.password) }
    }
  } catch {
    /* 无法解密（密钥环境变化等） */
  }
  return null
}

/**
 * 读取凭据：解密 credentials.enc。文件不存在 / 解密失败返回 null。
 */
export function getCredentials(): StoredCredentials | null {
  try {
    const file = credentialsPath()
    if (!fs.existsSync(file)) return null
    const raw = fs.readFileSync(file, 'utf-8').trim()
    if (!raw) return null
    return parsePlain(raw) || decryptCredentials(raw) || null
  } catch (e) {
    console.error('getCredentials failed:', e)
    return null
  }
}

/**
 * 管理端密钥：环境变量 GIPFEL_ADMIN_KEY 优先，其次 userData/admin-key.txt。
 * 两者都无返回 null（绝不硬编码）。
 */
export function getAdminKey(): string | null {
  const envKey = process.env['GIPFEL_ADMIN_KEY']
  if (envKey && envKey.trim()) return envKey.trim()
  try {
    const file = adminKeyPath()
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8').trim()
      if (content) return content
    }
  } catch (e) {
    console.error('read admin-key.txt failed:', e)
  }
  return null
}
