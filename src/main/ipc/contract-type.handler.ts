import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { queryAll } from '../database/helpers'

export function registerContractTypeHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CONTRACT_TYPE_LIST, () => {
    try {
      return queryAll('SELECT * FROM contract_types ORDER BY sort_order, name')
    } catch (err: any) {
      console.error('CONTRACT_TYPE_LIST failed:', err)
      return { success: false, message: `获取合同类型失败：${err.message || '未知错误'}` }
    }
  })
}
