import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { CompanyRepository } from '../database/repositories/company.repo'
import { requirePermission } from '../session'
import { PERMISSIONS } from '../../shared/permissions'

export function registerCompanyHandlers(): void {
  const repo = new CompanyRepository()

  ipcMain.handle(IPC_CHANNELS.COMPANY_LIST, () => {
    try {
      return repo.list()
    } catch (err: any) {
      console.error('COMPANY_LIST failed:', err)
      return { success: false, message: `获取公司列表失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.COMPANY_GET, (_e, id: number) => {
    try {
      return repo.getById(id)
    } catch (err: any) {
      console.error('COMPANY_GET failed:', err)
      return { success: false, message: `获取公司详情失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.COMPANY_CREATE, (_e, data: Record<string, unknown>) => {
    try {
      requirePermission(PERMISSIONS.COMPANY_MANAGE, '没有新建公司的权限')
      return repo.create(data)
    } catch (err: any) {
      console.error('COMPANY_CREATE failed:', err)
      return { success: false, message: `创建公司失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.COMPANY_UPDATE, (_e, id: number, data: Record<string, unknown>) => {
    try {
      requirePermission(PERMISSIONS.COMPANY_MANAGE, '没有修改公司的权限')
      return repo.update(id, data)
    } catch (err: any) {
      console.error('COMPANY_UPDATE failed:', err)
      return { success: false, message: `更新公司失败：${err.message || '未知错误'}` }
    }
  })

  ipcMain.handle(IPC_CHANNELS.COMPANY_DELETE, (_e, id: number) => {
    try {
      requirePermission(PERMISSIONS.COMPANY_MANAGE, '没有停用公司的权限')
      repo.delete(id)
      return { success: true }
    } catch (err: any) {
      console.error('COMPANY_DELETE failed:', err)
      return { success: false, message: `删除公司失败：${err.message || '未知错误'}` }
    }
  })
}
