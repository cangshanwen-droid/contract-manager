/**
 * notification.repo.ts - 通知中心数据访问
 *
 * 通知为「按用户」存储：每条通知绑定 user_id，
 * 由业务触发点（审批/公告/交易）调用领域辅助方法批量写入。
 *
 * 触发源：
 *  - 合同提交审批   → notifyContractSubmitted → 所有 admin 用户
 *  - 合同批准/驳回  → notifyContractDecision  → 创建人（created_by）
 *  - 新公告发布     → notifyAnnouncement      → 所有用户
 *  - 账户交易       → notifyTransaction       → admin/operator（账户管理人员）
 */
import { BrowserWindow } from 'electron'
import { queryAll, queryOne, execute } from '../helpers'
import { IPC_CHANNELS } from '../../../shared/constants'
import type { AppNotification, NotificationType } from '../../../shared/types'

export interface NotificationPayload {
  title: string
  content?: string
  type?: NotificationType
  link?: string
}

/** 通知变更后广播给渲染进程（铃铛红点即时刷新） */
function broadcastChanged(): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.NOTIFICATION_CHANGED_EVENT)
    }
  } catch (err) {
    console.error('broadcast notification failed:', err)
  }
}

export class NotificationRepository {
  /** 某用户的最近通知（默认 50 条，最新在前） */
  list(userId: number, limit = 50): AppNotification[] {
    return queryAll(
      `SELECT * FROM notifications WHERE user_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ?`,
      [userId, limit]
    ) as unknown as AppNotification[]
  }

  /** 未读数 */
  unreadCount(userId: number): number {
    const row = queryOne(
      'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND read = 0',
      [userId]
    )
    return (row?.cnt as number) ?? 0
  }

  /** 标记已读：id 省略 → 全部已读（仅限本人通知，防止越权） */
  markRead(userId: number, id?: number): void {
    if (id === undefined) {
      execute('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0', [userId])
    } else {
      execute('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', [id, userId])
    }
    broadcastChanged()
  }

  /** 给指定用户写入一条通知 */
  create(userId: number, data: NotificationPayload): void {
    execute(
      `INSERT INTO notifications (user_id, title, content, type, link)
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId,
        data.title,
        data.content || '',
        data.type || 'system',
        data.link || ''
      ]
    )
    broadcastChanged()
  }

  /** 批量写入（一次业务事件 → 多条通知） */
  createForMany(userIds: number[], data: NotificationPayload): void {
    if (!userIds || userIds.length === 0) return
    for (const uid of userIds) this.create(uid, data)
  }

  /** 所有指定角色的用户 id */
  userIdsByRole(roles: string[]): number[] {
    if (!roles || roles.length === 0) return []
    const placeholders = roles.map(() => '?').join(',')
    const rows = queryAll(
      `SELECT id FROM users WHERE role IN (${placeholders})`,
      roles
    )
    return rows.map((r) => r.id as number)
  }

  /** 通知所有 admin 用户（合同提交审批） */
  notifyAdmins(data: NotificationPayload): void {
    this.createForMany(this.userIdsByRole(['admin']), data)
  }

  /** 通知所有用户（新公告） */
  notifyAll(data: NotificationPayload): void {
    const rows = queryAll('SELECT id FROM users')
    this.createForMany(rows.map((r) => r.id as number), data)
  }

  /** 按用户名通知（找不到用户时回退到 admin） */
  notifyUserByUsername(username: string, data: NotificationPayload): void {
    if (!username) {
      this.notifyAdmins(data)
      return
    }
    const row = queryOne('SELECT id FROM users WHERE username = ?', [username])
    if (row?.id !== undefined) {
      this.create(row.id as number, data)
    } else {
      this.notifyAdmins(data)
    }
  }

  /** ── 业务触发：合同提交审批 → 通知 admin ── */
  notifyContractSubmitted(contract: { id: number; contract_no?: string; contract_name?: string }): void {
    this.notifyAdmins({
      title: '合同待审批',
      content: `合同「${contract.contract_name || ''}」（${contract.contract_no || ''}）已提交审批，请及时处理`,
      type: 'approval',
      link: '/contracts'
    })
  }

  /** ── 业务触发：合同批准/驳回 → 通知创建人 ── */
  notifyContractDecision(
    contract: { id: number; contract_no?: string; contract_name?: string; created_by?: string },
    action: 'approve' | 'reject'
  ): void {
    const isApprove = action === 'approve'
    this.notifyUserByUsername(contract.created_by || '', {
      title: isApprove ? '合同已批准' : '合同已驳回',
      content: `您提交的合同「${contract.contract_name || ''}」（${contract.contract_no || ''}）已${isApprove ? '审批通过' : '被驳回'}，请查看详情`,
      type: 'approval',
      link: '/contracts'
    })
  }

  /** ── 业务触发：新公告发布 → 通知所有用户 ── */
  notifyAnnouncement(announcement: { id: number; title?: string; content?: string; priority?: string }): void {
    const snippet = (announcement.content || '').slice(0, 60)
    this.notifyAll({
      title: `新公告${announcement.priority === 'high' ? '（紧急）' : ''}：${announcement.title || ''}`,
      content: snippet || '点击查看公告详情',
      type: 'announcement',
      link: '/announcements'
    })
  }

  /** ── 业务触发：账户交易 → 通知账户管理人员（admin/operator）── */
  notifyTransaction(
    accountId: number,
    transType: 'income' | 'expense',
    amount: number,
    description?: string,
    category?: string
  ): void {
    // 解析账户所属区域，让通知更可读
    let regionName = ''
    try {
      const row = queryOne(
        `SELECT r.name AS region_name FROM region_accounts a
         LEFT JOIN regions r ON r.id = a.region_id WHERE a.id = ?`,
        [accountId]
      )
      regionName = (row?.region_name as string) || ''
    } catch { /* 忽略解析失败 */ }

    const sign = transType === 'income' ? '+' : '-'
    this.createForMany(this.userIdsByRole(['admin', 'operator']), {
      title: `${regionName ? `${regionName}·` : ''}账户${transType === 'income' ? '收入' : '支出'} ${sign}¥${Number(amount || 0).toFixed(2)}`,
      content: `${category || '交易'}：${description || '账户资金变动'}`,
      type: 'transaction',
      link: '/accounts'
    })
  }
}

/** 单例导出，供各 handler 直接使用 */
export const notificationRepo = new NotificationRepository()
