/**
 * 细粒度权限点定义（Gipfel）
 *
 * 权限模型：角色（rep/operator/admin）→ 权限点（permission）→ 菜单/路由/操作。
 * 前端（RoleGuard / AppLayout / 页面按钮）与后端（IPC handler）双重校验。
 *
 * 单一事实来源：
 *  - 角色 → 权限点 的映射在数据库 roles 表（migration v17）中持久化；
 *  - 登录成功后由主进程计算用户的 permissions 列表返回前端；
 *  - 本文件为前端引用与迁移种子数据保持一致。
 */

export const PERMISSIONS = {
  // ── 合同域 ──
  CONTRACT_CREATE: 'contract.create',
  CONTRACT_APPROVE: 'contract.approve',
  CONTRACT_EDIT: 'contract.edit',
  CONTRACT_VIEW: 'contract.view',
  // ── 资金域 ──
  ACCOUNT_CREATE: 'account.create',
  ACCOUNT_TRANSACT: 'account.transact',
  ACCOUNT_VIEW: 'account.view',
  // ── 系统域 ──
  USER_MANAGE: 'user.manage',
  ANNOUNCE_MANAGE: 'announce.manage',
  STOCK_TRADE: 'stock.trade',
  SYSTEM_CONFIG: 'system.config',
  // ── v1.3.1 审核加固：公司/区域管理（rep 只读，防篡改本地数据）──
  COMPANY_MANAGE: 'company.manage',
  REGION_MANAGE: 'region.manage'
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS)

/** 角色 → 权限点（保守方案：保持 3 个固定角色，用权限点细化控制） */
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  // 代表端：只读（含股票面板只读视图——rep 需看到本公司上市股票行情）
  rep: [
    PERMISSIONS.CONTRACT_VIEW,
    PERMISSIONS.ACCOUNT_VIEW,
    PERMISSIONS.STOCK_TRADE
  ],

  // 操作端：合同全流程（创建/审批/编辑）+ 资金操作 + 股票 + 公告
  operator: [
    PERMISSIONS.CONTRACT_VIEW,
    PERMISSIONS.CONTRACT_CREATE,
    PERMISSIONS.CONTRACT_APPROVE,
    PERMISSIONS.CONTRACT_EDIT,
    PERMISSIONS.ACCOUNT_VIEW,
    PERMISSIONS.ACCOUNT_CREATE,
    PERMISSIONS.ACCOUNT_TRANSACT,
    PERMISSIONS.STOCK_TRADE,
    PERMISSIONS.ANNOUNCE_MANAGE,
    PERMISSIONS.COMPANY_MANAGE,
    PERMISSIONS.REGION_MANAGE
  ],

  // 管理端：全部
  admin: [...ALL_PERMISSIONS]
}

/** 权限点中文说明（用户管理/审计展示用） */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'contract.create': '新建合同',
  'contract.approve': '合同审批（状态流转）',
  'contract.edit': '编辑合同',
  'contract.view': '查看合同',
  'account.create': '新建账户',
  'account.transact': '资金交易（收支流水）',
  'account.view': '查看资金',
  'user.manage': '用户管理',
  'announce.manage': '公告管理',
  'stock.trade': '股票交易',
  'system.config': '系统设置（备份/导入导出）',
  'company.manage': '公司管理（增改停用）',
  'region.manage': '区域管理（增改删）'
}

/** 判断用户是否拥有某权限点 */
export function hasPermission(
  user: { permissions?: string[] } | null | undefined,
  permission: string
): boolean {
  return !!user && Array.isArray(user.permissions) && user.permissions.includes(permission)
}
