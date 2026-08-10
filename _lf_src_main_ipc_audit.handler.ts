import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { PERMISSIONS } from '../../shared/permissions'
import { insertAuditLog, listAuditLogs } from '../database/repositories/audit.repo'
import { requirePermission } from '../session'

export function registerAuditHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AUDIT_LIST, (_e, opts?: {
    username?: string
    action?: string
    page?: number
    pageSize?: number
  }) => {
    try {
      // 审计日志涉及全系统操作痕迹：需要 user.manage
      const perm = requirePermission(PERMISSIONS.USER_MANAGE, '没有查看审计日志的权限')
      if (!perm.ok) return perm.response
      return { success: true, ...listAuditLogs(opts) }
    } catch (err: any) {
      console.error('AUDIT_LIST failed:', err)
      return { success: false, message: `获取审计日志失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AUDIT_LOG, (_e, params: {
    username: string
    role: string
    action: string
    target: string
    target_id?: number
    old_value?: string
    new_value?: string
    ip?: string
    result?: string
  }) => {
    try {
      insertAuditLog(params)
      return { success: true }
    } catch (err: any) {
      console.error('AUDIT_LOG failed:', err)
      return { success: false }
    }
  })
}
