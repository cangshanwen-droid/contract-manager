import { ipcMain } from 'electron'
import bcrypt from 'bcryptjs'
import { IPC_CHANNELS } from '../../shared/constants'
import { PERMISSIONS } from '../../shared/permissions'
import { queryOne, queryAll } from '../database/helpers'
import { getDatabase } from '../database/connection'
import { insertAuditLog } from '../database/repositories/audit.repo'
import {
  setSessionUser, getSessionUser, resolveUserPermissions,
  requirePermission, forbiddenResponse, auditIdentity
} from '../session'

// bcrypt 加盐轮数
const BCRYPT_ROUNDS = 12

// 登录限流：每个用户名最多 5 次/分钟失败
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_LOCKOUT_MINUTES = 1

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

/**
 * 登录成功收尾：记录审计 + 建立主进程会话 + 返回用户对象
 */
function finishLogin(user: {
  id: number | bigint; username: string; role?: string; password?: string;
  company_id?: number | null; company_name?: string | null
}) {
  const uid = Number(user.id)
  // 记录最后登录时间（系统概览活跃用户统计）
  try {
    getDatabase().run(
      "UPDATE users SET last_login = datetime('now','localtime') WHERE id = ?",
      [uid]
    )
  } catch (e) {
    console.error('update last_login failed:', e)
  }
  insertAuditLog({
    username: user.username,
    role: (user.role as string) || 'user',
    action: 'login',
    target: 'user',
    target_id: uid,
    result: 'success'
  })

  // 建立主进程会话：计算该用户的权限点列表（roles 表 + user_roles 关联）
  const permissions = resolveUserPermissions(uid)
  setSessionUser({
    id: uid,
    username: user.username,
    role: (user.role as string) || 'user',
    permissions,
    // v22 公司绑定：登录响应携带 company_id + company_name（数据隔离依据）
    company_id: (user.company_id as number | null) ?? null,
    company_name: (user.company_name as string | undefined) || undefined
  })

  return {
    success: true,
    user: {
      id: uid,
      username: user.username,
      role: user.role,
      permissions,
      company_id: (user.company_id as number | null) ?? null,
      company_name: (user.company_name as string | undefined) || undefined
    }
  }
}

/**
 * v1.3.0 云端统一账号兜底：调 gipfel-api /api/auth/login 验证。
 * 多人多机场景：本地密码不一致时用云端账号（单一账号源）兜底登录。
 * 返回云端用户信息（role/company_id）或 null（验证失败/云端不可达）。
 */
function verifyAgainstCloud(username: string, password: string): Promise<{
  role?: string; company_id?: number | null
} | null> {
  return new Promise((resolve) => {
    const https = require('https')
    const cloudBase = (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CLOUD_API_BASE } = require('../../shared/cloud-config')
        return CLOUD_API_BASE as string
      } catch {
        return 'https://106.54.26.86'
      }
    })()
    const url = new URL(`${cloudBase}/api/auth/login`)
    const body = JSON.stringify({ username, password })
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      rejectUnauthorized: false // 自签名证书：信任白名单主机（will-navigate 已精确匹配）
    }, (res: any) => {
      let data = ''
      res.on('data', (c: Buffer) => { data += c.toString() })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (res.statusCode === 200 && parsed?.user) {
            resolve({
              role: parsed.user.role ?? 'user',
              company_id: parsed.user.company_id ?? null
            })
          } else {
            resolve(null)
          }
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(8000, () => { req.destroy(); resolve(null) })
    req.write(body)
    req.end()
  })
}

export function registerAuthHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_e, username: string, password: string) => {
    try {
      // 登录限流检查
      const limit = checkLoginLimit(username)
      if (!limit.allowed) {
        return { success: false, message: `登录尝试过多，请 ${limit.remaining} 秒后重试` }
      }

      const user = queryOne(
        `SELECT u.id, u.username, u.role, u.password, u.company_id, c.name AS company_name
         FROM users u
         LEFT JOIN companies c ON c.id = u.company_id
         WHERE u.username = ?`,
        [username]
      )
      if (!user) {
        loginAttempts.get(username)!.count++
        return { success: false, message: '用户名或密码错误' }
      }

      // bcrypt 验证
      const valid = bcrypt.compareSync(password, user.password as string)

      if (!valid) {
        // ── v1.3.0 云端统一账号兜底：本地密码不匹配时，尝试云端验证。
        // 多人多机场景：任何电脑用云端账号（如 admin/admin123）即可登录；
        // 云端验证通过 → 同步本地用户密码 hash，下次本地直通。──
        const cloudUser = await verifyAgainstCloud(username, password)
        if (cloudUser) {
          // 同步本地：更新或创建该用户（密码 hash 同步为本地 bcrypt）
          const localHash = bcrypt.hashSync(password, BCRYPT_ROUNDS)
          const existing = queryOne('SELECT id FROM users WHERE username = ?', [username])
          if (existing) {
            getDatabase().run(
              'UPDATE users SET password = ?, role = ?, company_id = ? WHERE id = ?',
              [localHash, cloudUser.role ?? (user.role as string) ?? 'user',
               cloudUser.company_id ?? user.company_id ?? null, existing.id]
            )
          } else {
            const res = getDatabase().run(
              'INSERT INTO users(username, password, role, company_id) VALUES (?, ?, ?, ?)',
              [username, localHash, cloudUser.role ?? 'user', cloudUser.company_id ?? null]
            )
            user = {
              id: res.lastInsertRowid,
              username,
              role: cloudUser.role ?? 'user',
              password: localHash,
              company_id: cloudUser.company_id ?? null,
              company_name: null
            } as any
          }
          if (existing) {
            user = queryOne(
              `SELECT u.id, u.username, u.role, u.password, u.company_id, c.name AS company_name
               FROM users u LEFT JOIN companies c ON c.id = u.company_id
               WHERE u.username = ?`, [username]
            )
          }
          loginAttempts.delete(username)
          return finishLogin(user as any)
        }
        loginAttempts.get(username)!.count++
        return { success: false, message: '用户名或密码错误' }
      }

      // 登录成功，清除限流
      loginAttempts.delete(username)
      return finishLogin(user as any)
    } catch (err: any) {
      console.error('AUTH_LOGIN failed:', err)
      return { success: false, message: `登录失败：${err.message || '未知错误'}` }
    }
  })

  // 退出登录：清除主进程会话（后端权限校验依据）
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, () => {
    setSessionUser(null)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_REGISTER, (_e, username: string, password: string, role?: string, companyId?: number | null) => {
    try {
      // 用户创建类操作：需要 user.manage 权限（后端校验，防止绕过前端）
      const perm = requirePermission(PERMISSIONS.USER_MANAGE)
      if (!perm.ok) return perm.response
      const userRole = role || 'rep'
      if (!['rep', 'operator', 'admin'].includes(userRole)) {
        return { success: false, message: '无效的角色类型' }
      }
      if (username.length < 2) return { success: false, message: '用户名至少2个字符' }
      if (password.length < 6) return { success: false, message: '密码至少6个字符' }
      // 密码强度检查：必须包含字母和数字
      if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        return { success: false, message: '密码需包含字母和数字' }
      }
      const existing = queryOne('SELECT id FROM users WHERE username = ?', [username])
      if (existing) return { success: false, message: '用户名已存在' }
      // v22：可选绑定公司
      let bindCompanyId: number | null = null
      if (companyId != null && companyId !== 0) {
        const comp = queryOne('SELECT id FROM companies WHERE id = ? AND is_active = 1', [companyId])
        if (!comp) return { success: false, message: '绑定的公司不存在或已停用' }
        bindCompanyId = Number(companyId)
      }
      const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS)
      getDatabase().run(
        'INSERT INTO users (username, password, role, company_id) VALUES (?, ?, ?, ?)',
        [username, hash, userRole, bindCompanyId]
      )
      const newUserId = (getDatabase().exec('SELECT last_insert_rowid() as id')[0].values[0][0]) as number
      // P1-7 审计归属可信化：操作者取自主进程会话（无会话时兜底 system）
      insertAuditLog({
        username: auditIdentity().username,
        role: auditIdentity().role,
        action: 'register',
        target: 'user',
        target_id: newUserId,
        new_value: JSON.stringify({ username }),
        result: 'success'
      })
      return { success: true }
    } catch (err: any) {
      console.error('AUTH_REGISTER failed:', err)
      return { success: false, message: `注册失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.AUTH_CHANGE_PASSWORD,
    (_e, username: string, oldPwd: string, newPwd: string, _operator?: string, _operatorRole?: string) => {
      try {
        if (newPwd.length < 6) return { success: false, message: '新密码至少6个字符' }
        if (!/[A-Za-z]/.test(newPwd) || !/[0-9]/.test(newPwd)) {
          return { success: false, message: '新密码需包含字母和数字' }
        }

        const user = queryOne('SELECT id, password FROM users WHERE username = ?', [username])
        if (!user) return { success: false, message: '用户不存在' }

        // bcrypt 验证旧密码
        const oldValid = bcrypt.compareSync(oldPwd, user.password as string)
        if (!oldValid) return { success: false, message: '原密码错误' }

        const hash = bcrypt.hashSync(newPwd, BCRYPT_ROUNDS)
        getDatabase().run('UPDATE users SET password = ? WHERE id = ?', [
          hash, user.id
        ])
        insertAuditLog({
          username: auditIdentity().username,
          role: auditIdentity().role,
          action: 'change_password',
          target: 'user',
          target_id: user.id as number,
          result: 'success'
        })
        return { success: true }
      } catch (err: any) {
        console.error('AUTH_CHANGE_PASSWORD failed:', err)
        return { success: false, message: `修改密码失败：${err.message || '未知错误'}` }
      }
    }
  )

  // admin 创建用户（指定角色 + 可选绑定公司 v22）
  ipcMain.handle(
    IPC_CHANNELS.AUTH_CREATE_USER,
    (_e, username: string, password: string, role: string, companyId?: number | null, _operator?: string, _operatorRole?: string) => {
      try {
        // user.manage 校验；首次使用引导（无会话且用户表为空）时放行，用于创建首个 admin
        if (getSessionUser()) {
          const perm = requirePermission(PERMISSIONS.USER_MANAGE)
          if (!perm.ok) return perm.response
        } else {
          const count = queryOne('SELECT COUNT(*) AS cnt FROM users') as { cnt?: number } | null
          if ((count?.cnt ?? 0) > 0) return forbiddenResponse('没有权限创建用户')
        }
        if (!['rep', 'operator', 'admin'].includes(role)) {
          return { success: false, message: '无效的角色类型' }
        }
        if (username.length < 2) return { success: false, message: '用户名至少2个字符' }
        if (password.length < 6) return { success: false, message: '密码至少6个字符' }
        if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
          return { success: false, message: '密码需包含字母和数字' }
        }
        const existing = queryOne('SELECT id FROM users WHERE username = ?', [username])
        if (existing) return { success: false, message: '用户名已存在' }
        // v22 公司绑定：companyId 非空时校验公司存在（防止悬空外键）
        let bindCompanyId: number | null = null
        if (companyId != null && companyId !== 0) {
          const comp = queryOne('SELECT id FROM companies WHERE id = ? AND is_active = 1', [companyId])
          if (!comp) return { success: false, message: '绑定的公司不存在或已停用' }
          bindCompanyId = Number(companyId)
        }
        const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS)
        getDatabase().run(
          'INSERT INTO users (username, password, role, company_id) VALUES (?, ?, ?, ?)',
          [username, hash, role, bindCompanyId]
        )
        const newUserId = (getDatabase().exec('SELECT last_insert_rowid() as id')[0].values[0][0]) as number
        insertAuditLog({
          username: _operator || username,
          role: _operatorRole || role,
          action: 'create_user',
          target: 'user',
          target_id: newUserId,
          new_value: JSON.stringify({ username, role, company_id: bindCompanyId }),
          result: 'success'
        })
        return { success: true }
      } catch (err: any) {
        console.error('AUTH_CREATE_USER failed:', err)
        return { success: false, message: `创建用户失败：${err.message || '未知错误'}` }
      }
    }
  )

  // 删除用户（不可删除最后一个 admin）
  ipcMain.handle(IPC_CHANNELS.AUTH_DELETE_USER, (_e, userId: number, _operator?: string, _operatorRole?: string) => {
    try {
      const perm = requirePermission(PERMISSIONS.USER_MANAGE)
      if (!perm.ok) return perm.response
      const user = queryOne('SELECT id, role, username FROM users WHERE id = ?', [userId])
      if (!user) return { success: false, message: '用户不存在' }
      // 不允许删除最后一个 admin
      if (user.role === 'admin') {
        const adminCount = queryOne('SELECT COUNT(*) as cnt FROM users WHERE role = ?', ['admin']) as any
        if (adminCount?.cnt <= 1) {
          return { success: false, message: '不能删除最后一个管理员账户' }
        }
      }
      getDatabase().run('DELETE FROM users WHERE id = ?', [userId])
      insertAuditLog({
        username: _operator || (user.username as string),
        role: _operatorRole || (user.role as string) || 'user',
        action: 'delete_user',
        target: 'user',
        target_id: userId,
        old_value: JSON.stringify({ username: user.username, role: user.role }),
        result: 'success'
      })
      return { success: true }
    } catch (err: any) {
      console.error('AUTH_DELETE_USER failed:', err)
      return { success: false, message: `删除用户失败：${err.message || '未知错误'}` }
    }
  })

  // admin 重置任意用户密码（无需旧密码；可重置自己但前端提示；目标用户不存在时报错）
  ipcMain.handle(
    IPC_CHANNELS.AUTH_RESET_PASSWORD,
    (_e, userId: number, newPwd: string, _operator?: string, _operatorRole?: string) => {
      try {
        // user.manage 权限校验（基于主进程会话，不信任渲染进程传入的角色）
        const perm = requirePermission(PERMISSIONS.USER_MANAGE, '没有重置密码的权限')
        if (!perm.ok) return perm.response

        if (newPwd.length < 6) return { success: false, message: '新密码至少6个字符' }
        if (!/[A-Za-z]/.test(newPwd) || !/[0-9]/.test(newPwd)) {
          return { success: false, message: '新密码需包含字母和数字' }
        }

        const user = queryOne('SELECT id, username, role FROM users WHERE id = ?', [userId])
        if (!user) return { success: false, message: '用户不存在' }

        const hash = bcrypt.hashSync(newPwd, BCRYPT_ROUNDS)
        getDatabase().run('UPDATE users SET password = ? WHERE id = ?', [hash, userId])

        // 审计日志（记录被重置用户与操作者）
        insertAuditLog({
          username: _operator || (user.username as string),
          role: _operatorRole || (user.role as string) || 'user',
          action: 'reset_password',
          target: 'user',
          target_id: userId,
          new_value: JSON.stringify({ username: user.username, role: user.role }),
          result: 'success'
        })

        // 允许重置自己，但向前端返回提示标记
        const isSelf = getSessionUser()?.id === userId
        return { success: true, isSelf }
      } catch (err: any) {
        console.error('AUTH_RESET_PASSWORD failed:', err)
        return { success: false, message: `重置密码失败：${err.message || '未知错误'}` }
      }
    }
  )

  // 列出所有用户（登录页首次使用检测需要匿名放行；会话存在时要求 user.manage）
  ipcMain.handle(IPC_CHANNELS.AUTH_LIST_USERS, () => {
    try {
      if (getSessionUser()) {
        const perm = requirePermission(PERMISSIONS.USER_MANAGE)
        if (!perm.ok) return perm.response
      }
      const db = getDatabase()
      // v22：联表返回 company_id + company_name（用户管理页展示所属公司）
      const users = queryAll(
        `SELECT u.id, u.username, u.role, u.company_id, c.name AS company_name, u.created_at, u.last_login
         FROM users u
         LEFT JOIN companies c ON c.id = u.company_id
         ORDER BY u.id`
      )
      return { success: true, users }
    } catch (err: any) {
      console.error('AUTH_LIST_USERS failed:', err)
      return { success: false, message: `获取用户列表失败：${err.message || '未知错误'}` }
    }
  })
}
