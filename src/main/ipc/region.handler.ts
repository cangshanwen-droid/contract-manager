import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { RegionRepository } from '../database/repositories/region.repo'

export function registerRegionHandlers(): void {
  const repo = new RegionRepository()

  ipcMain.handle(IPC_CHANNELS.REGION_LIST, () => {
    return repo.list()
  })

  ipcMain.handle(IPC_CHANNELS.REGION_GET, (_e, id: number) => {
    return repo.getById(id)
  })

  ipcMain.handle(IPC_CHANNELS.REGION_CREATE, (_e, data: Record<string, unknown>) => {
    return repo.create(data)
  })

  ipcMain.handle(IPC_CHANNELS.REGION_UPDATE, (_e, id: number, data: Record<string, unknown>) => {
    return repo.update(id, data)
  })

  ipcMain.handle(IPC_CHANNELS.REGION_DELETE, (_e, id: number) => {
    repo.delete(id)
    return { success: true }
  })
}
