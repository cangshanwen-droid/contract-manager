import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { RegionRepository } from '../database/repositories/region.repo'
import { getSessionUser, requirePermission } from '../session'
import { PERMISSIONS } from '../../shared/permissions'

export function registerRegionHandlers(): void {
  const repo = new RegionRepository()

  ipcMain.handle(IPC_CHANNELS.REGION_LIST, () => {
    try {
      return repo.list()
    } catch (err: any) {
      console.error('REGION_LIST failed:', err)
      return { success: false, message: `获取区域列表失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.REGION_GET, (_e, id: number) => {
    try {
      return repo.getById(id)
    } catch (err: any) {
      console.error('REGION_GET failed:', err)
      return { success: false, message: `获取区域详情失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.REGION_CREATE, (_e, data: Record<string, unknown>) => {
    try {
      const permission = requirePermission(PERMISSIONS.REGION_MANAGE, '没有新建区域的权限')
      if (!permission.ok) return permission.response
      return repo.create(data)
    } catch (err: any) {
      console.error('REGION_CREATE failed:', err)
      return { success: false, message: `创建区域失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.REGION_UPDATE, (_e, id: number, data: Record<string, unknown>) => {
    try {
      const permission = requirePermission(PERMISSIONS.REGION_MANAGE, '没有修改区域的权限')
      if (!permission.ok) return permission.response
      return repo.update(id, data)
    } catch (err: any) {
      console.error('REGION_UPDATE failed:', err)
      return { success: false, message: `更新区域失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.REGION_DELETE, (_e, id: number) => {
    try {
      const permission = requirePermission(PERMISSIONS.REGION_MANAGE, '没有删除区域的权限')
      if (!permission.ok) return permission.response
      if (getSessionUser()?.role !== 'admin') return { success: false, code: 'FORBIDDEN', message: '仅管理端可以删除区域' }
      repo.delete(id)
      return { success: true }
    } catch (err: any) {
      console.error('REGION_DELETE failed:', err)
      return { success: false, message: `删除区域失败：${err.message || '未知错误'}` }
    }
  })
}
