import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { CompanyRepository } from '../database/repositories/company.repo'

export function registerCompanyHandlers(): void {
  const repo = new CompanyRepository()

  ipcMain.handle(IPC_CHANNELS.COMPANY_LIST, () => repo.list())
  ipcMain.handle(IPC_CHANNELS.COMPANY_GET, (_e, id: number) => repo.getById(id))
  ipcMain.handle(IPC_CHANNELS.COMPANY_CREATE, (_e, data: Record<string, unknown>) =>
    repo.create(data)
  )
  ipcMain.handle(IPC_CHANNELS.COMPANY_UPDATE, (_e, id: number, data: Record<string, unknown>) =>
    repo.update(id, data)
  )
  ipcMain.handle(IPC_CHANNELS.COMPANY_DELETE, (_e, id: number) => {
    repo.delete(id)
    return { success: true }
  })
}
