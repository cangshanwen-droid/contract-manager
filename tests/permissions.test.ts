/**
 * 权限模型单测
 * 1. ROLE_PERMISSIONS 静态映射（rep 只读 / operator 合同全流程 / admin 全量）
 * 2. resolveUserPermissions 数据库计算（roles 表路径 + users.role 兜底路径）
 * 3. 会话守卫 hasPermission / requirePermission / forbiddenResponse
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { setupTestDb } from './helpers/setup'
import { getDatabase } from '../src/main/database/connection'
import {
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission
} from '../src/shared/permissions'
import {
  forbiddenResponse,
  getSessionUser,
  hasPermission as sessionHasPermission,
  requirePermission,
  resolveUserPermissions,
  setSessionUser
} from '../src/main/session'

function insertUser(username: string, role: string): number {
  const db = getDatabase()
  db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, 'x', role])
  // 注意：不能用 last_insert_rowid() -- 立即持久化(_flushSave→db.export)会把它重置为 0
  const row = db.exec('SELECT id FROM users WHERE username = ?', [username])
  return row[0].values[0][0] as number
}

beforeEach(async () => {
  await setupTestDb()
  setSessionUser(null)
})

describe('ROLE_PERMISSIONS 静态映射', () => {
  it('rep：只读--有 contract.view/account.view/stock.trade（股票面板只读视图），无任何写权限', () => {
    const perms = ROLE_PERMISSIONS.rep
    expect(perms).toContain(PERMISSIONS.CONTRACT_VIEW)
    expect(perms).toContain(PERMISSIONS.ACCOUNT_VIEW)
    // v1.3.0 修复：用户端需看到股票面板（只读行情视图，UI 层禁交易按钮）
    expect(perms).toContain(PERMISSIONS.STOCK_TRADE)
    expect(perms).not.toContain(PERMISSIONS.CONTRACT_CREATE)
    expect(perms).not.toContain(PERMISSIONS.CONTRACT_APPROVE)
    expect(perms).not.toContain(PERMISSIONS.CONTRACT_EDIT)
    expect(perms).not.toContain(PERMISSIONS.USER_MANAGE)
    expect(perms).not.toContain(PERMISSIONS.SYSTEM_CONFIG)
    expect(perms).toHaveLength(3)
  })

  it('operator：合同全流程（create/approve/edit）+ 资金 + 股票 + 公告', () => {
    const perms = ROLE_PERMISSIONS.operator
    expect(perms).toContain(PERMISSIONS.CONTRACT_CREATE)
    expect(perms).toContain(PERMISSIONS.CONTRACT_APPROVE)
    expect(perms).toContain(PERMISSIONS.CONTRACT_EDIT)
    expect(perms).toContain(PERMISSIONS.ACCOUNT_CREATE)
    expect(perms).toContain(PERMISSIONS.ACCOUNT_TRANSACT)
    expect(perms).toContain(PERMISSIONS.STOCK_TRADE)
    expect(perms).toContain(PERMISSIONS.ANNOUNCE_MANAGE)
    // operator 是业务角色，不能管用户/系统配置
    expect(perms).not.toContain(PERMISSIONS.USER_MANAGE)
    expect(perms).not.toContain(PERMISSIONS.SYSTEM_CONFIG)
  })

  it('admin：全量权限（ALL_PERMISSIONS 的超集 = 全集）', () => {
    expect(ROLE_PERMISSIONS.admin).toEqual(ALL_PERMISSIONS)
    for (const p of ALL_PERMISSIONS) {
      expect(ROLE_PERMISSIONS.admin).toContain(p)
    }
    expect(ROLE_PERMISSIONS.admin).toContain(PERMISSIONS.USER_MANAGE)
    expect(ROLE_PERMISSIONS.admin).toContain(PERMISSIONS.SYSTEM_CONFIG)
  })

  it('权限点全集与中文标签一一对应', () => {
    expect(ALL_PERMISSIONS).toHaveLength(11)
    expect(Object.keys(PERMISSION_LABELS).sort()).toEqual([...ALL_PERMISSIONS].sort())
  })

  it('hasPermission：按用户 permissions 数组判断', () => {
    expect(hasPermission({ permissions: ['contract.view'] }, 'contract.view')).toBe(true)
    expect(hasPermission({ permissions: ['contract.view'] }, 'contract.approve')).toBe(false)
    expect(hasPermission(null, 'contract.view')).toBe(false)
    expect(hasPermission({}, 'contract.view')).toBe(false)
  })
})

describe('resolveUserPermissions（数据库计算）', () => {
  it('roles 表路径：admin 角色解析出 user.manage + system.config', () => {
    const db = getDatabase()
    const uid = insertUser('boss', 'admin')
    // 手工建立 user_roles 关联（走 roles 表 JSON 主路径）
    db.run(
      'INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?',
      [uid, 'admin']
    )
    const perms = resolveUserPermissions(uid)
    expect(perms).toContain('user.manage')
    expect(perms).toContain('system.config')
    expect(perms).toContain('contract.approve')
  })

  it('rep 角色解析出的权限与静态映射一致', () => {
    const db = getDatabase()
    const uid = insertUser('xiaowang', 'rep')
    db.run('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?', [uid, 'rep'])
    expect(resolveUserPermissions(uid).sort()).toEqual([...ROLE_PERMISSIONS.rep].sort())
  })

  it('兜底路径：无 user_roles 关联时按 users.role 内置映射解析', () => {
    const uid = insertUser('laoli', 'operator')
    // 不建 user_roles → 走 users.role 兜底
    const perms = resolveUserPermissions(uid)
    expect(perms).toContain('contract.create')
    expect(perms).toContain('contract.approve')
    expect(perms).toContain('stock.trade')
    expect(perms).not.toContain('user.manage')
  })

  it('未知角色不返回权限，不存在的用户不抛错', () => {
    const uid = insertUser('ghost', 'superman')
    expect(resolveUserPermissions(uid)).toEqual([])
    expect(resolveUserPermissions(99999)).toEqual([])
  })
})

describe('会话守卫（setSessionUser / hasPermission / requirePermission）', () => {
  it('未登录时无任何权限，requirePermission 返回 FORBIDDEN', () => {
    expect(getSessionUser()).toBeNull()
    expect(sessionHasPermission('contract.view')).toBe(false)
    const res = requirePermission('contract.view')
    expect(res).toEqual({ ok: false, response: expect.objectContaining({ code: 'FORBIDDEN' }) })
  })

  it('rep 会话：view 放行、approve 拦截', () => {
    setSessionUser({ id: 1, username: 'rep1', role: 'rep', permissions: ROLE_PERMISSIONS.rep })
    expect(requirePermission('contract.view')).toEqual({ ok: true })
    const denied = requirePermission('contract.approve', '无权审批')
    expect(denied).toEqual({ ok: false, response: expect.objectContaining({ code: 'FORBIDDEN', message: '无权审批' }) })
  })

  it('admin 会话：全量放行', () => {
    setSessionUser({ id: 2, username: 'admin1', role: 'admin', permissions: ROLE_PERMISSIONS.admin })
    for (const p of ALL_PERMISSIONS) {
      expect(requirePermission(p)).toEqual({ ok: true })
    }
  })

  it('forbiddenResponse 统一错误结构', () => {
    expect(forbiddenResponse()).toEqual({ success: false, code: 'FORBIDDEN', message: '没有权限执行此操作' })
    expect(forbiddenResponse('自定义').message).toBe('自定义')
  })
})
