/**
 * notification.handler.ts - 通知中心 IPC
 *
 * 所有接口基于主进程会话（getSessionUser）取当前用户 id，
 * 不信任渲染进程传入的 user_id，防止越权读取他人通知。
 */
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { getSessionUser } from '../session'
import { notificationRepo } from '../database/repositories/notification.repo'

export function registerNotificationHandlers(): void {
  // 当前用户通知列表（最新 50 条在前）
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_LIST, (_e, limit?: number) => {
    try {
      const user = getSessionUser()
      if (!user) return { success: false, message: '未登录' }
      return { success: true, items: notificationRepo.list(user.id, limit ?? 50) }
    } catch (err: any) {
      console.error('NOTIFICATION_LIST failed:', err)
      return { success: false, message: `获取通知失败：${err.message || '未知错误'}` }
    }
  })

  // 未读数（铃铛红点）
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_UNREAD_COUNT, () => {
    try {
      const user = getSessionUser()
      if (!user) return { success: false, message: '未登录' }
      return { success: true, count: notificationRepo.unreadCount(user.id) }
    } catch (err: any) {
      console.error('NOTIFICATION_UNREAD_COUNT failed:', err)
      return { success: false, message: `获取未读数失败：${err.message || '未知错误'}` }
    }
  })

  // 标记已读：传 id → 单条；不传 → 全部已读
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_MARK_READ, (_e, id?: number) => {
    try {
      const user = getSessionUser()
      if (!user) return { success: false, message: '未登录' }
      notificationRepo.markRead(user.id, id)
      return { success: true }
    } catch (err: any) {
      console.error('NOTIFICATION_MARK_READ failed:', err)
      return { success: false, message: `标记已读失败：${err.message || '未知错误'}` }
    }
  })
}
