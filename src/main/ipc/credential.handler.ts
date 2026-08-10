/**
 * credential.handler.ts - 凭据安全存储 IPC（安全审计 P1-7）
 *
 *  - credential:set   登录成功后保存凭据：主进程 safeStorage 加密写入
 *                     userData/credentials.enc（渲染进程不再接触明文持久化）
 *  - credential:get   读取已保存凭据（股票系统免登录用），无则返回 null
 *  - admin:get-key    获取管理端密钥：环境变量 GIPFEL_ADMIN_KEY →
 *                     userData/admin-key.txt → null（绝不进入渲染进程包）
 */
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { getSessionUser } from '../session'
import { setCredentials, getCredentials, getAdminKey } from '../credential-store'

export function registerCredentialHandlers(): void {
  // ── credential:set：仅允许已登录会话调用（登录流程 AUTH_LOGIN 成功后已建会话）──
  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_SET, (_event, payload: { username?: unknown; password?: unknown }) => {
    try {
      if (!getSessionUser()) {
        return { success: false, code: 'UNAUTHORIZED', message: '未登录，无法保存凭据' }
      }
      const username = typeof payload?.username === 'string' ? payload.username : ''
      const password = typeof payload?.password === 'string' ? payload.password : ''
      if (!username || !password) {
        return { success: false, message: '凭据不完整' }
      }
      return setCredentials(username, password)
    } catch (e: any) {
      console.error('CREDENTIAL_SET failed:', e)
      return { success: false, message: `凭据保存失败：${e?.message || '未知错误'}` }
    }
  })

  // ── credential:get：读取已加密保存的凭据 ──
  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_GET, () => {
    try {
      return { success: true, credentials: getCredentials() }
    } catch (e: any) {
      console.error('CREDENTIAL_GET failed:', e)
      return { success: false, message: `凭据读取失败：${e?.message || '未知错误'}` }
    }
  })

  // ── admin:get-key：管理端密钥（env → admin-key.txt → null）──
  ipcMain.handle(IPC_CHANNELS.ADMIN_GET_KEY, () => {
    const key = getAdminKey()
    if (!key) {
      return {
        success: false,
        code: 'NO_ADMIN_KEY',
        message: '未配置管理端密钥（请设置环境变量 GIPFEL_ADMIN_KEY 或 userData/admin-key.txt）',
      }
    }
    return { success: true, key }
  })
}
