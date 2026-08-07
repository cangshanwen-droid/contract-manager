import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { queryAll } from '../database/helpers'

export function registerContractTypeHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CONTRACT_TYPE_LIST, () => {
    return queryAll('SELECT * FROM contract_types ORDER BY sort_order, name')
  })
}
