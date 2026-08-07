import { ipcMain } from 'electron'
import { randomBytes, pbkdf2Sync } from 'crypto'
import { IPC_CHANNELS } from '../../shared/constants'
import { queryOne } from '../database/helpers'
import { getDatabase } from '../database/connection'

// 密码安全配置
const SALT_LENGTH = 32
const PBKDF2_ITERATIONS = 100000
const PBKDF2_KEYLEN = 64
const PBKDF2_DIGEST = 'sha512'

// 登录限流：每个用户名最多 5 次/分钟失败
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_LOCKOUT_MINUTES = 1

function hashPassword(password: string, salt?: Buffer): { hash: string; salt: string } {
  const actualSalt = salt ?? randomBytes(SALT_LENGTH)
  const hash = pbkdf2Sync(password, actualSalt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
  return {
    hash: hash.toString('hex'),
    salt: actualSalt.toString('hex')
  }
}

function checkLoginLimit(username: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const record = loginAttempts.get(username)
  if (record && now < record.resetAt && record.count >= MAX_LOGIN_ATTEMPTS) {
    const remainingSec = Math.ceil((record.resetAt - now) / 1000)
    return { allowed: false, remaining: remainingSec }
  }
  if (!record || now >= record.resetAt) {
    loginAttempts.set(username, { count: 0, resetAt: now + LOGIN_LOCKOUT_MINUTES * 60 * 1000 })
  }
  return { allowed: true, remaining: -1 }
}

export function registerAuthHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, (_e, username: string, password: string) => {
    // 登录限流检查
    const limit = checkLoginLimit(username)
    if (!limit.allowed) {
      return { success: false, message: `登录尝试过多，请 ${limit.remaining} 秒后重试` }
    }

    const user = queryOne(
      'SELECT id, username, role, password, salt FROM users WHERE username = ?',
      [username]
    )
    if (!user) {
      loginAttempts.get(username)!.count++
      return { success: false, message: '用户名或密码错误' }
    }

    // 兼容旧密码（无盐 SHA256）
    let valid = false
    if (user.salt) {
      const { hash } = hashPassword(password, Buffer.from(user.salt as string, 'hex'))
      valid = hash === user.password
    } else {
      // 兼容旧格式：用旧 SHA256 验证，成功后自动升级为 PBKDF2
      const { createHash } = require('crypto')
      const oldHash = createHash('sha256').update(password).digest('hex')
      if (oldHash === user.password) {
        // 自动升级密码
        const { hash, salt } = hashPassword(password)
        getDatabase().run('UPDATE users SET password = ?, salt = ? WHERE id = ?', [
          hash, salt, user.id
        ])
        valid = true
      }
    }

    if (!valid) {
      loginAttempts.get(username)!.count++
      return { success: false, message: '用户名或密码错误' }
    }

    // 登录成功，清除限流
    loginAttempts.delete(username)
    return { success: true, user: { id: user.id, username: user.username, role: user.role } }
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_REGISTER, (_e, username: string, password: string) => {
    if (username.length < 2) return { success: false, message: '用户名至少2个字符' }
    if (password.length < 6) return { success: false, message: '密码至少6个字符' }
    // 密码强度检查
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return { success: false, message: '密码需包含字母和数字' }
    }
    const existing = queryOne('SELECT id FROM users WHERE username = ?', [username])
    if (existing) return { success: false, message: '用户名已存在' }
    const { hash, salt } = hashPassword(password)
    getDatabase().run(
      'INSERT INTO users (username, password, salt, role) VALUES (?, ?, ?, ?)',
      [username, hash, salt, 'user']
    )
    return { success: true }
  })

  ipcMain.handle(
    IPC_CHANNELS.AUTH_CHANGE_PASSWORD,
    (_e, username: string, oldPwd: string, newPwd: string) => {
      if (newPwd.length < 6) return { success: false, message: '新密码至少6个字符' }
      if (!/[A-Za-z]/.test(newPwd) || !/[0-9]/.test(newPwd)) {
        return { success: false, message: '新密码需包含字母和数字' }
      }

      const user = queryOne('SELECT id, password, salt FROM users WHERE username = ?', [username])
      if (!user) return { success: false, message: '用户不存在' }

      // 验证旧密码
      let oldValid = false
      if (user.salt) {
        const { hash } = hashPassword(oldPwd, Buffer.from(user.salt as string, 'hex'))
        oldValid = hash === user.password
      } else {
        const { createHash } = require('crypto')
        const oldHash = createHash('sha256').update(oldPwd).digest('hex')
        oldValid = oldHash === user.password
      }
      if (!oldValid) return { success: false, message: '原密码错误' }

      const { hash, salt } = hashPassword(newPwd)
      getDatabase().run('UPDATE users SET password = ?, salt = ? WHERE id = ?', [
        hash, salt, user.id
      ])
      return { success: true }
    }
  )
}
