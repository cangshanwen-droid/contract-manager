import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { PERMISSIONS } from '../../shared/permissions'
import { getDatabase } from '../database/connection'
import { queryAll, lastInsertId } from '../database/helpers'
import { notificationRepo } from '../database/repositories/notification.repo'
import { requirePermission } from '../session'

export function registerAnnouncementHandlers(): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.ANNOUNCEMENT_LIST, (_e, filters?: { priority?: string; region_id?: number }) => {
    try {
      const perm = requirePermission(PERMISSIONS.ANNOUNCE_MANAGE)
      if (!perm.ok) return perm.response
      let sql = `SELECT a.*, r.name as region_name FROM announcements a LEFT JOIN regions r ON r.id = a.region_id WHERE a.is_active = 1`
      const params: unknown[] = []
      if (filters?.priority) { sql += ' AND a.priority = ?'; params.push(filters.priority) }
      if (filters?.region_id !== undefined) {
        sql += ' AND (a.region_id IS NULL OR a.region_id = ?)'
        params.push(filters.region_id)
      }
      sql += ' ORDER BY CASE a.priority WHEN \'high\' THEN 1 WHEN \'normal\' THEN 2 ELSE 3 END, a.created_at DESC'
      return queryAll(sql, params)
    } catch (err: any) {
      console.error('ANNOUNCEMENT_LIST failed:', err)
      return { success: false, message: err.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.ANNOUNCEMENT_ACTIVE_LIST, (_e, regionId?: number) => {
    try {
      let sql = `SELECT a.*, r.name as region_name FROM announcements a LEFT JOIN regions r ON r.id = a.region_id WHERE a.is_active = 1`
      const params: unknown[] = []
      if (regionId !== undefined) {
        sql += ' AND (a.region_id IS NULL OR a.region_id = ?)'
        params.push(regionId)
      }
      sql += ' ORDER BY a.created_at DESC LIMIT 10'
      return queryAll(sql, params)
    } catch (err: any) {
      console.error('ANNOUNCEMENT_ACTIVE_LIST failed:', err)
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.ANNOUNCEMENT_CREATE, (_e, data: { title: string; content: string; region_id?: number; priority?: string; created_by: string }) => {
    try {
      const perm = requirePermission(PERMISSIONS.ANNOUNCE_MANAGE, '没有公告管理的权限')
      if (!perm.ok) return perm.response
      db.run(
        `INSERT INTO announcements (title, content, region_id, priority, created_by) VALUES (?, ?, ?, ?, ?)`,
        [data.title, data.content, data.region_id ?? null, data.priority ?? 'normal', data.created_by]
      )
      // 通知中心：新公告 → 通知所有用户
      try {
        notificationRepo.notifyAnnouncement({
          id: lastInsertId(),
          title: data.title,
          content: data.content,
          priority: data.priority
        })
      } catch (err) {
        console.error('notification trigger failed:', err)
      }
      return { success: true }
    } catch (err: any) {
      console.error('ANNOUNCEMENT_CREATE failed:', err)
      return { success: false, message: err.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.ANNOUNCEMENT_DELETE, (_e, id: number) => {
    try {
      const perm = requirePermission(PERMISSIONS.ANNOUNCE_MANAGE, '没有公告管理的权限')
      if (!perm.ok) return perm.response
      db.run(`UPDATE announcements SET is_active = 0, updated_at = datetime('now','localtime') WHERE id = ?`, [id])
      return { success: true }
    } catch (err: any) {
      console.error('ANNOUNCEMENT_DELETE failed:', err)
      return { success: false, message: err.message }
    }
  })
}
