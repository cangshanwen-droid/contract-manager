import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { ContractRepository } from '../database/repositories/contract.repo'

export function registerContractHandlers(): void {
  const repo = new ContractRepository()

  ipcMain.handle(IPC_CHANNELS.CONTRACT_LIST, (_e, regionId?: number) => {
    return repo.list(regionId)
  })

  ipcMain.handle(IPC_CHANNELS.CONTRACT_GET, (_e, id: number) => {
    return repo.getById(id)
  })

  ipcMain.handle(IPC_CHANNELS.CONTRACT_CREATE, (_e, data) => {
    return repo.create(data as any)
  })

  ipcMain.handle(IPC_CHANNELS.CONTRACT_DELETE, (_e, id: number) => {
    repo.delete(id)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.CONTRACT_SUMMARIZE, (_e, regionId: number) => {
    return repo.summarizeByRegion(regionId)
  })
}
