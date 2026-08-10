import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { RegionRepository } from '../database/repositories/region.repo'

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
      return repo.create(data)
    } catch (err: any) {
      console.error('REGION_CREATE failed:', err)
      return { success: false, message: `创建区域失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.REGION_UPDATE, (_e, id: number, data: Record<string, unknown>) => {
    try {
      return repo.update(id, data)
    } catch (err: any) {
      console.error('REGION_UPDATE failed:', err)
      return { success: false, message: `更新区域失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.REGION_DELETE, (_e, id: number) => {
    try {
      repo.delete(id)
      return { success: true }
    } catch (err: any) {
      console.error('REGION_DELETE failed:', err)
      return { success: false, message: `删除区域失败：${err.message || '未知错误'}` }
    }
  })
}
