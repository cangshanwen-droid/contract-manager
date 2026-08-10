/**
 * NotificationBell — 通知中心铃铛组件（AppLayout 顶栏）
 *
 * - 铃铛图标 + 未读红点（Badge count）
 * - 点击展开下拉通知面板（Popover）
 * - 点击单条通知 → 标记已读 + 按 link 跳转
 * - 「全部已读」按钮
 * - 数据源：15s 轮询 + 主进程 notification:changed 推送（实时刷新）
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, Popover, Button, Empty, Spin, Tag } from 'antd'
import { BellOutlined, CheckOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { invoke } from '../../api/cloudApi'
import { IPC_CHANNELS } from '../../../../shared/constants'
import type { AppNotification, NotificationType } from '../../../../shared/types'

const TYPE_META: Record<NotificationType, { color: string; label: string }> = {
  approval:     { color: 'gold',   label: '审批' },
  announcement: { color: 'blue',   label: '公告' },
  transaction:  { color: 'green',  label: '交易' },
  system:       { color: 'default', label: '系统' },
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 */
function timeAgo(ts: string): string {
  if (!ts) return ''
  const t = new Date(ts.replace(' ', 'T')).getTime()
  if (Number.isNaN(t)) return ts
  const diff = Math.max(0, Date.now() - t)
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  return ts.slice(0, 10)
}

const NotificationBell: React.FC = () => {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)

  const openRef = useRef(open)
  openRef.current = open

  const refreshUnread = useCallback(async () => {
    try {
      const res = await invoke(IPC_CHANNELS.NOTIFICATION_UNREAD_COUNT)
      if (res?.success) setUnread(res.count || 0)
    } catch { /* 忽略轮询错误 */ }
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await invoke(IPC_CHANNELS.NOTIFICATION_LIST)
      if (res?.success) setItems(res.items || [])
    } catch { /* 忽略 */ } finally { setLoading(false) }
  }, [])

  // 挂载加载 + 15s 轮询未读数 + 主进程推送即时刷新
  useEffect(() => {
    refreshUnread()
    loadList()
    const timer = setInterval(refreshUnread, 15000)
    const off = window.api.on(IPC_CHANNELS.NOTIFICATION_CHANGED_EVENT, () => {
      refreshUnread()
      if (openRef.current) loadList()
    })
    return () => { clearInterval(timer); off() }
  }, [refreshUnread, loadList])

  // 打开面板时拉取最新列表
  useEffect(() => {
    if (open) loadList()
  }, [open, loadList])

  const handleClickItem = async (n: AppNotification) => {
    if (!n.read) {
      try { await invoke(IPC_CHANNELS.NOTIFICATION_MARK_READ, n.id) } catch { /* 忽略 */ }
      setUnread(u => Math.max(0, u - 1))
      setItems(list => list.map(x => (x.id === n.id ? { ...x, read: 1 } : x)))
    }
    if (n.link) navigate(n.link)
    setOpen(false)
  }

  const handleMarkAll = async () => {
    try { await invoke(IPC_CHANNELS.NOTIFICATION_MARK_READ) } catch { /* 忽略 */ }
    setUnread(0)
    setItems(list => list.map(x => ({ ...x, read: 1 })))
  }

  const panel = (
    <div style={{
      width: 344,
      maxHeight: 440,
      display: 'flex',
      flexDirection: 'column',
      background: '#1A1F2E',
    }}>
      {/* 面板头部：标题 + 全部已读 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', borderBottom: '1px solid #1E2D40', flexShrink: 0,
      }}>
        <span style={{ color: '#E2E8F0', fontSize: 13, fontWeight: 600 }}>通知中心</span>
        <Button
          type="link" size="small"
          icon={<CheckOutlined />}
          style={{ color: '#D4AF37', fontSize: 12, padding: 0, height: 'auto' }}
          onClick={handleMarkAll}
          disabled={unread === 0}
        >
          全部已读
        </Button>
      </div>

      {/* 通知列表 */}
      <div style={{ overflow: 'auto', flex: 1 }}>
        {loading && items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 28 }}><Spin size="small" /></div>
        ) : items.length === 0 ? (
          <Empty description="暂无通知" style={{ padding: 28 }} imageStyle={{ height: 44 }} />
        ) : (
          items.map(n => {
            const meta = TYPE_META[n.type] || TYPE_META.system
            return (
              <div
                key={n.id}
                onClick={() => handleClickItem(n)}
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid rgba(30,45,64,0.6)',
                  cursor: 'pointer',
                  background: n.read ? 'transparent' : 'rgba(212,175,55,0.06)',
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.background = n.read ? 'transparent' : 'rgba(212,175,55,0.06)'
                }}
              >
                {/* 标题行：类型标签 + 标题 + 未读红点 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag color={meta.color} style={{ margin: 0, fontSize: 11, lineHeight: '16px', flexShrink: 0 }}>
                    {meta.label}
                  </Tag>
                  <span style={{
                    color: '#E2E8F0', fontSize: 12.5,
                    fontWeight: n.read ? 400 : 600,
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {n.title}
                  </span>
                  {!n.read && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
                  )}
                </div>
                {/* 内容摘要（最多两行） */}
                {n.content && (
                  <div style={{
                    color: '#94A3B8', fontSize: 12, marginTop: 4, lineHeight: 1.5,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {n.content}
                  </div>
                )}
                {/* 时间 */}
                <div style={{ color: '#64748B', fontSize: 11, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ClockCircleOutlined style={{ fontSize: 11 }} />
                  {timeAgo(n.created_at)}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )

  return (
    <Popover
      content={panel}
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      overlayInnerStyle={{ padding: 0, background: '#1A1F2E', borderRadius: 4, border: '1px solid #1E2D40' }}
    >
      <Badge count={unread} size="small" offset={[-4, 4]} style={{ boxShadow: 'none' }}>
        <span
          style={{
            cursor: 'pointer', fontSize: 16, color: '#94A3B8',
            lineHeight: '52px', display: 'inline-flex', alignItems: 'center',
            transition: 'color 150ms ease', padding: '0 4px',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.color = '#E2E8F0' }}
          onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.color = '#94A3B8' }}
        >
          <BellOutlined />
        </span>
      </Badge>
    </Popover>
  )
}

export default NotificationBell
