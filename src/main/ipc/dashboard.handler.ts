import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { DashboardRepository } from '../database/repositories/dashboard.repo'
import { queryAll } from '../database/helpers'

export function registerDashboardHandlers(): void {
  const repo = new DashboardRepository()

  ipcMain.handle(IPC_CHANNELS.DASHBOARD_SUMMARY, () => {
    return repo.getSummary()
  })

  ipcMain.handle(IPC_CHANNELS.INFRA_TYPE_LIST, () => {
    return queryAll('SELECT * FROM infrastructure_types ORDER BY name')
  })

  ipcMain.handle(IPC_CHANNELS.FILE_OPEN, (_e, url: string) => {
    shell.openExternal(url)
    return { success: true }
  })
}
