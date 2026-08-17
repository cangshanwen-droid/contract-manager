/**
 * 主进程会话与后端权限校验
 *
 * 单窗口桌面应用：登录成功后在此记录当前用户（含权限点列表），
 * 所有 IPC handler 通过 requirePermission() 在服务端二次校验，
 * 防止绕过前端直接调用。
 */
import { queryAll, queryOne } from './database/helpers'

export interface SessionUser {
  id: number
  username: string
  role: string
  permissions: string[]
  /** 绑定的公司（v22 数据隔离）：rep 强隔离只读本公司数据；operator/admin 可空 */
  company_id?: number | null
  company_name?: string
}

let currentUser: SessionUser | null = null

export function setSessionUser(user: SessionUser | null): void {
  currentUser = user
}

export function getSessionUser(): SessionUser | null {
  return currentUser
}

/**
 * 审计归属唯一来源（P1-7 修复）：
 * 审计日志的 username/role 一律取自主进程会话，忽略渲染进程透传的
 * _operatorRole / created_by / updated_by / operator 等字段（可被伪造）。
 * 无会话（如首次引导创建首个 admin）时兜底为 system，绝不采用渲染进程声明值。
 */
export function auditIdentity(): { username: string; role: string } {
  const u = currentUser
  return { username: u?.username || 'system', role: u?.role || 'user' }
}

/** 权限不足的统一 IPC 响应 */
export function forbiddenResponse(message?: string): Record<string, unknown> {
  return {
    success: false,
    code: 'FORBIDDEN',
    message: message || '没有权限执行此操作'
  }
}

/**
 * 从数据库计算用户的有效权限点：
 *  - 主路径：roles 表（permissions JSON）← user_roles 关联 ← users
 *  - 兜底：users.role 内置映射（防止 roles 表被清空时权限完全失效）
 */
export function resolveUserPermissions(userId: number): string[] {
  const perms = new Set<string>()

  try {
    const rows = queryAll(
      `SELECT r.permissions AS permissions
         FROM roles r
         JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = ?`,
      [userId]
    )
    for (const row of rows) {
      const raw = row.permissions as string
      if (!raw) continue
      try {
        const list = JSON.parse(raw)
        if (Array.isArray(list)) list.forEach((p: string) => perms.add(p))
      } catch {
        /* 忽略损坏的 JSON */
      }
    }
  } catch (err) {
    console.error('resolveUserPermissions (roles) failed:', err)
  }

  // 兜底：按 users.role 内置映射
  try {
    const user = queryOne('SELECT role FROM users WHERE id = ?', [userId])
    const role = user?.role as string | undefined
    const fallback: Record<string, string[]> = {
      rep: ['contract.view', 'account.view', 'stock.trade'],
      operator: [
        'contract.view', 'contract.create', 'contract.approve', 'contract.edit',
        'account.view', 'account.create', 'account.transact',
        'stock.trade', 'announce.manage', 'company.manage', 'region.manage'
      ],
      admin: [
        'contract.view', 'contract.create', 'contract.approve', 'contract.edit',
        'account.view', 'account.create', 'account.transact',
        'user.manage', 'announce.manage', 'stock.trade', 'system.config',
        'company.manage', 'region.manage'
      ]
    }
    if (role && fallback[role]) fallback[role].forEach((p) => perms.add(p))
  } catch (err) {
    console.error('resolveUserPermissions (fallback) failed:', err)
  }

  return [...perms]
}

/** 当前会话是否拥有某权限点 */
export function hasPermission(permission: string): boolean {
  return !!currentUser && currentUser.permissions.includes(permission)
}

/**
 * 后端权限守卫：
 *   ok=true  → 放行
 *   ok=false → 返回统一 403 响应（调用方直接 return）
 */
export function requirePermission(
  permission: string,
  message?: string
): { ok: true } | { ok: false; response: Record<string, unknown> } {
  if (hasPermission(permission)) return { ok: true }
  return { ok: false, response: forbiddenResponse(message) }
}
