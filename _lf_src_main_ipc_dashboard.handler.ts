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

  // file:open 外部链接打开（P0-D 修复：scheme 白名单，仅放行 http/https，
  // 拒绝 file: / ms-settings: / smb: 等本地/协议链接，防止渲染进程被诱导打开任意本地文件）
  ipcMain.handle(IPC_CHANNELS.FILE_OPEN, (_e, url: string) => {
    try {
      if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
        return { success: false, message: '无效的链接' }
      }
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        return { success: false, message: '仅允许打开 http/https 链接' }
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { success: false, message: `已拦截非 http/https 链接: ${parsed.protocol}` }
      }
      if (!parsed.hostname) {
        return { success: false, message: '链接缺少有效主机名' }
      }
      shell.openExternal(url)
      return { success: true }
    } catch (err: any) {
      console.error('FILE_OPEN failed:', err)
      return { success: false, message: `打开链接失败：${err.message || '未知错误'}` }
    }
  })
}
