import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { PERMISSIONS } from '../../shared/permissions'
import { DashboardRepository } from '../database/repositories/dashboard.repo'
import { queryAll } from '../database/helpers'
import { requirePermission } from '../session'

export function registerDashboardHandlers(): void {
  const repo = new DashboardRepository()

  ipcMain.handle(IPC_CHANNELS.DASHBOARD_SUMMARY, () => {
    try {
      return repo.getSummary()
    } catch (err: any) {
      console.error('DASHBOARD_SUMMARY failed:', err)
      return { success: false, message: `获取仪表盘数据失败：${err.message || '未知错误'}` }
    }
  })

  // 系统概览统计（用户构成/活跃用户/最近创建用户）- 仅管理端
  ipcMain.handle(IPC_CHANNELS.DASHBOARD_SYSTEM_STATS, () => {
    try {
      const perm = requirePermission(PERMISSIONS.USER_MANAGE, '没有查看系统概览的权限')
      if (!perm.ok) return perm.response
      return { success: true, stats: repo.getSystemStats() }
    } catch (err: any) {
      console.error('DASHBOARD_SYSTEM_STATS failed:', err)
      return { success: false, message: `获取系统概览失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.INFRA_TYPE_LIST, () => {
    try {
      return queryAll('SELECT * FROM infrastructure_types ORDER BY name')
    } catch (err: any) {
      console.error('INFRA_TYPE_LIST failed:', err)
      return { success: false, message: `获取基建类型失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.FILE_OPEN, (_e, url: string) => {
    try {
      shell.openExternal(url)
      return { success: true }
    } catch (err: any) {
      console.error('FILE_OPEN failed:', err)
      return { success: false, message: `打开链接失败：${err.message || '未知错误'}` }
    }
  })
}
