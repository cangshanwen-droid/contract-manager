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

export function registerAuthHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, (_e, username: string, password: string) => {
    try {
      // 登录限流检查
      const limit = checkLoginLimit(username)
      if (!limit.allowed) {
        return { success: false, message: `登录尝试过多，请 ${limit.remaining} 秒后重试` }
      }

      const user = queryOne(
        'SELECT id, username, role, password FROM users WHERE username = ?',
        [username]
      )
      if (!user) {
        loginAttempts.get(username)!.count++
        return { success: false, message: '用户名或密码错误' }
      }

      // bcrypt 验证
      const valid = bcrypt.compareSync(password, user.password as string)

      if (!valid) {
        loginAttempts.get(username)!.count++
        return { success: false, message: '用户名或密码错误' }
      }

      // 登录成功，清除限流
      loginAttempts.delete(username)
      // 记录最后登录时间（系统概览活跃用户统计）
      try {
        getDatabase().run(
          "UPDATE users SET last_login = datetime('now','localtime') WHERE id = ?",
          [user.id]
        )
      } catch (e) {
        console.error('update last_login failed:', e)
      }
      insertAuditLog({
        username,
        role: (user.role as string) || 'user',
        action: 'login',
        target: 'user',
        target_id: user.id as number,
        result: 'success'
      })

      // 建立主进程会话：计算该用户的权限点列表（roles 表 + user_roles 关联）
      const permissions = resolveUserPermissions(user.id as number)
      setSessionUser({
        id: user.id as number,
        username: user.username as string,
        role: (user.role as string) || 'user',
        permissions
      })

      return { success: true, user: { id: user.id, username: user.username, role: user.role, permissions } }
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

  ipcMain.handle(IPC_CHANNELS.AUTH_REGISTER, (_e, username: string, password: string, role?: string) => {
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
      const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS)
      getDatabase().run(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        [username, hash, userRole]
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

  // admin 创建用户（指定角色）
  ipcMain.handle(
    IPC_CHANNELS.AUTH_CREATE_USER,
    (_e, username: string, password: string, role: string, _operator?: string, _operatorRole?: string) => {
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
        const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS)
        getDatabase().run(
          'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
          [username, hash, role]
        )
        const newUserId = (getDatabase().exec('SELECT last_insert_rowid() as id')[0].values[0][0]) as number
        insertAuditLog({
          username: _operator || username,
          role: _operatorRole || role,
          action: 'create_user',
          target: 'user',
          target_id: newUserId,
          new_value: JSON.stringify({ username, role }),
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
      const users = queryAll('SELECT id, username, role, created_at, last_login FROM users ORDER BY id')
      return { success: true, users }
    } catch (err: any) {
      console.error('AUTH_LIST_USERS failed:', err)
      return { success: false, message: `获取用户列表失败：${err.message || '未知错误'}` }
    }
  })
}
