/**
 * AppLayout - Gipfel Institutional Platform v6
 *
 * 侧边栏: 220px, T.panel(#0F2748) 基础暗色
 * Logo: 64px 居中，不重复品牌名
 * 导航: 业务组/工具组/市场组 三分组 + 分割线
 * Active: 金色左边框条 (#D4AF37 3px) + 微亮背景
 * Hover: 微亮背景
 * 底部用户区: 用户名 + 角色标签 + 点击退出
 *
 * v6 新增:
 *  - 多级面包屑导航（区域管理 > 合同列表）
 *  - 响应式侧栏折叠按钮
 *  - 全局 Escape 关闭弹窗 / Enter 提交表单
 *
 * Spatial System (8px grid):
 *   --gds-space-1:   8px    (grid unit)
 *   --gds-space-2:  16px    (card gap)
 *   --gds-space-3:  24px    (section gap)
 *   --gds-space-4:  32px    (content padding)
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { Layout, Menu, Breadcrumb, Tag } from 'antd'
import {
  DashboardOutlined, EnvironmentOutlined, FileTextOutlined,
  TeamOutlined, BarChartOutlined,
  LogoutOutlined, UserOutlined, DollarOutlined, StockOutlined,
  NotificationOutlined, SettingOutlined, SafetyCertificateOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, EyeOutlined,
} from '@ant-design/icons'
import LOGO_ICON from '../../assets/logo-icon.txt?raw'
import NotificationBell from './NotificationBell'
import GlobalSearch from './GlobalSearch'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import type { MenuProps } from 'antd'
import { useAuth } from '../../context/AuthContext'
import { PERMISSIONS } from '../../../../shared/permissions'
import { tokens as T } from '../../styles/design-tokens'

const { Sider, Content, Header } = Layout

/**
 * 菜单项：可选 permission 字段。
 *  - 有 permission：菜单仅对拥有该权限点的用户可见（后端同步校验）
 *  - 无 permission：按 ROLE_MENU_KEYS 角色集合过滤（兼容无权限点的页面）
 */
const items: (MenuProps['items'][number] & { permission?: string })[] = [
  {
    type: 'group',
    label: '业务',
    children: [
      { key: '/dashboard',     icon: <DashboardOutlined />,    label: '仪表盘' },
      { key: '/regions',       icon: <EnvironmentOutlined />,  label: '区域管理' },
      { key: '/contracts',     icon: <FileTextOutlined />,     label: '合同总览', permission: PERMISSIONS.CONTRACT_VIEW },
      { key: '/infrastructure', icon: <SafetyCertificateOutlined />, label: '基础设施' },
    ],
  },
  {
    type: 'group',
    label: '工具',
    children: [
      { key: '/accounts',      icon: <DollarOutlined />,       label: '资金总览', permission: PERMISSIONS.ACCOUNT_VIEW },
      { key: '/calculate',     icon: <BarChartOutlined />,     label: '模拟计算' },
      { key: '/companies',     icon: <TeamOutlined />,         label: '公司管理' },
    ],
  },
  {
    type: 'group',
    label: '市场',
    children: [
      { key: '/stocks',        icon: <StockOutlined />,        label: '股票交易', permission: PERMISSIONS.STOCK_TRADE },
      { key: '/account-monitor', icon: <EyeOutlined />,        label: '账户监控', permission: PERMISSIONS.USER_MANAGE },
      { key: '/announcements', icon: <NotificationOutlined />, label: '公告管理', permission: PERMISSIONS.ANNOUNCE_MANAGE },
    ],
  },
  {
    type: 'group',
    label: '系统',
    children: [
      { key: '/users',         icon: <UserOutlined />,         label: '用户管理', permission: PERMISSIONS.USER_MANAGE },
      { key: '/settings',      icon: <SettingOutlined />,      label: '系统设置', permission: PERMISSIONS.SYSTEM_CONFIG },
    ],
  },
]

/** 路由层级映射 - 用于生成面包屑 */
const ROUTE_HIERARCHY: Record<string, { label: string; parent?: string }> = {
  dashboard:     { label: '仪表盘' },
  regions:       { label: '区域管理', parent: 'dashboard' },
  contracts:     { label: '合同总览', parent: 'dashboard' },
  companies:     { label: '公司管理', parent: 'dashboard' },
  infrastructure: { label: '基础设施', parent: 'dashboard' },
  calculate:     { label: '模拟计算', parent: 'dashboard' },
  'land-area':   { label: '土地面积报表', parent: 'dashboard' },
  'infra-calc':  { label: '基建计算器', parent: 'dashboard' },
  stocks:        { label: '股票交易', parent: 'dashboard' },
  accounts:      { label: '资金总览', parent: 'dashboard' },
  settings:      { label: '系统设置', parent: 'dashboard' },
  users:         { label: '用户管理', parent: 'dashboard' },
  announcements: { label: '公告管理', parent: 'dashboard' },
  trends:        { label: '趋势分析', parent: 'dashboard' },
}

/**
 * Sidebar menu overrides - Gold accent theme
 * Selected: #D4AF37 gold left border 3px + rgba(212,175,55,0.10) bg
 * Hover: rgba(255,255,255,0.04) subtle bg highlight
 * Default: T.textSecondary text
 * Group titles: uppercase, muted, with top-border dividers between groups
 */
const menuOverrideCSS = `
  .gipfel-sidebar .ant-menu-item-selected {
    background-color: rgba(212, 175, 55, 0.10) !important;
    color: var(--gipfel-text-primary) !important;
    border-left: 3px solid #D4AF37 !important;
  }
  .gipfel-sidebar .ant-menu-item:not(.ant-menu-item-selected):hover {
    background-color: rgba(255, 255, 255, 0.04) !important;
    color: var(--gipfel-text-primary) !important;
  }
  .gipfel-sidebar .ant-menu-item .anticon {
    color: inherit !important;
    font-size: 14px !important;
  }
  .gipfel-sidebar .ant-menu-item-selected .anticon {
    color: var(--gipfel-text-primary) !important;
  }
  .gipfel-sidebar .ant-menu-item {
    color: var(--gipfel-text-secondary) !important;
    line-height: 1.5 !important;
    margin: 0 !important;
    padding-left: 18px !important;
    border-left: 3px solid transparent !important;
    border-radius: 0 !important;
    height: 40px !important;
  }
  .gipfel-sidebar .ant-menu-item-group-title {
    color: var(--gipfel-text-muted) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    padding-left: 18px !important;
    margin-top: 20px !important;
    margin-bottom: 2px !important;
    line-height: 1.5 !important;
    border-top: 1px solid var(--gipfel-border) !important;
    padding-top: 20px !important;
  }
  .gipfel-sidebar .ant-menu-item-group:first-child .ant-menu-item-group-title {
    border-top: none !important;
    margin-top: 8px !important;
    padding-top: 0 !important;
  }
  .gipfel-sidebar.ant-menu-dark {
    background: transparent !important;
  }
  .gipfel-sidebar.ant-menu-dark .ant-menu-item-selected {
    background-color: rgba(212, 175, 55, 0.10) !important;
  }

  /* Responsive: sidebar collapse */
  @media (max-width: 960px) {
    .gipfel-layout .ant-layout-sider {
      position: absolute !important;
      z-index: 100;
      height: 100vh;
    }
    .gipfel-layout .ant-layout-sider-collapsed {
      position: absolute !important;
      z-index: 100;
    }
    .gipfel-main-content {
      padding: 16px !important;
    }
  }
  @media (max-width: 600px) {
    .gipfel-main-content {
      padding: 8px !important;
    }
    .gipfel-topbar {
      padding: 0 12px !important;
    }
  }
`

/** 角色中文映射 */
const ROLE_LABELS: Record<string, string> = {
  rep:      '代表端',
  operator: '操作端',
  admin:    '管理端',
}

/** 各角色可访问的菜单 key 集合（无权限点映射的菜单项兜底） */
const ROLE_MENU_KEYS: Record<string, Set<string>> = {
  // rep: 仪表盘 + 合同总览(只读) + 资金总览(只读) + 本公司股票(只读)
  rep: new Set(['/dashboard', '/contracts', '/accounts', '/stocks']),
  operator: new Set([
    '/dashboard',
    '/regions', '/contracts', '/companies',
    '/calculate',
    '/accounts', '/announcements', '/stocks',
  ]),
  admin: new Set([
    '/dashboard',
    '/regions', '/contracts', '/companies', '/infrastructure',
    '/calculate',
    '/accounts', '/stocks', '/announcements', '/users', '/settings',
    '/account-monitor',
  ]),
}

const AppLayout: React.FC<{ onLogout?: () => void; username?: string; role?: string }> = ({ onLogout, username, role }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const authUser = useAuth()
  const userPermissions: string[] = authUser?.permissions || []
  const segments = location.pathname.split('/').filter(Boolean)
  const selected = '/' + (segments[0] || 'dashboard')
  const [collapsed, setCollapsed] = useState(false)

  // ── 生成面包屑层级 ──
  const breadcrumbItems = useMemo(() => {
    const crumbs: { title: React.ReactNode }[] = [
      { title: <span style={{ color: T.textSecondary, fontSize: 12 }}>首页</span> }
    ]
    if (segments.length > 0 && segments[0] !== 'dashboard') {
      const routeInfo = ROUTE_HIERARCHY[segments[0]]
      if (routeInfo) {
        // 如果有父级路由，先展示父级
        if (routeInfo.parent) {
          const parentInfo = ROUTE_HIERARCHY[routeInfo.parent]
          if (parentInfo) {
            crumbs.push({
              title: <span style={{ color: T.textSecondary, fontSize: 12, cursor: 'pointer' }}
                onClick={() => navigate('/' + routeInfo.parent)}>{parentInfo.label}</span>
            })
          }
        }
        crumbs.push({
          title: <span style={{ color: T.textPrimary, fontSize: 12, fontWeight: 500 }}>{routeInfo.label}</span>
        })
      } else {
        crumbs.push({
          title: <span style={{ color: T.textPrimary, fontSize: 12 }}>{segments[0]}</span>
        })
      }
    }
    return crumbs
  }, [segments, navigate])

  // ── 全局键盘快捷键：Escape 关闭弹窗 / Enter 提交表单 / Ctrl+Shift+N 新建区域 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape - 触发所有打开的 antd Modal/Drawer 关闭
      // antd Modal 自带 Escape 关闭，但我们需要确保全局范围内的 Escape 也能生效
      if (e.key === 'Escape') {
        // 聚焦到 body 来触发 antd 内置的 Escape 处理
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
      }
      // Ctrl+Shift+N - 跳转区域管理并打开新建区域弹窗（rep 无区域管理权限，拦截）
      if (e.ctrlKey && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        e.preventDefault()
        if (role === 'rep') return
        navigate('/regions')
        // 等路由切换后派发事件，RegionListPage 监听并打开弹窗
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('gipfel:create-region'))
        }, 80)
      }
      // Ctrl+B - 跳转公告页
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        navigate('/announcements')
      }
      // Ctrl+U - 跳转用户管理（仅 admin）
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && (e.key === 'u' || e.key === 'U')) {
        if (role === 'admin') {
          e.preventDefault()
          navigate('/users')
        }
      }
      // Ctrl+D - 跳转仪表盘
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        navigate('/dashboard')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, role])

  // 按角色 + 权限点双重过滤菜单：
  //   第一道：角色菜单集合（ROLE_MENU_KEYS）
  //   第二道：权限点（item.permission 存在时，用户必须拥有该权限点）
  const allowedKeys = ROLE_MENU_KEYS[role || 'rep'] || ROLE_MENU_KEYS.rep
  const filteredItems = useMemo(() =>
    items
      .map(group => {
        const children = group.children?.filter(child => {
          const key = child.key as string
          if (!allowedKeys.has(key)) return false
          const need = (child as any).permission as string | undefined
          if (need) return userPermissions.includes(need)
          return true
        })
        return { ...group, children }
      })
      .filter(group => group.children && group.children.length > 0),
    [role, userPermissions]
  )

  // ── 切换侧栏折叠 ──
  const toggleCollapse = useCallback(() => setCollapsed(v => !v), [])

  return (
    <Layout className="gipfel-layout" style={{ height: '100vh' }}>
      <style>{menuOverrideCSS}</style>

      {/* Sidebar: 220px - 暗色 T.panel(#0F2748) */}
      <Sider
        width={220}
        collapsedWidth={64}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        trigger={null}
        style={{
          background: T.panel,
          borderRight: `1px solid ${T.border}`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Logo 区域 - 64px 居中，无品牌名 */}
        <div style={{
          height: 64,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: collapsed ? '12px 8px' : '12px 16px',
          borderBottom: `1px solid ${T.border}`,
          flexShrink: 0,
        }}>
          <img src={LOGO_ICON} alt="GIPFEL"
            style={{ height: collapsed ? 32 : 40, width: 'auto', objectFit: 'contain' }} />
        </div>

        {/* Navigation - 三组 + 分割线 */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selected]}
            items={filteredItems}
            onClick={({ key }) => navigate(key)}
            className="gipfel-sidebar"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '0',
              fontSize: 13,
            }}
          />
        </div>

        {/* 底部用户区域 - 用户名 + 角色标签 + 点击退出 */}
        <div style={{
          borderTop: `1px solid ${T.border}`,
          padding: collapsed ? '10px 8px' : '14px 16px',
          cursor: onLogout ? 'pointer' : 'default',
          transition: 'background 150ms ease',
          flexShrink: 0,
          textAlign: collapsed ? 'center' : 'left',
        }}
        onClick={onLogout}
        onMouseEnter={e => {
          if (onLogout) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'transparent'
        }}
        >
          {!collapsed ? (
            <>
              {/* 用户头像 + 名字 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 8,
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: 'rgba(212, 175, 55, 0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <UserOutlined style={{ color: '#D4AF37', fontSize: 14 }} />
                </div>
                <span style={{
                  fontSize: 13, color: T.textPrimary,
                  lineHeight: 1.5, fontWeight: 500,
                }}>
                  {username || 'Admin'}
                </span>
              </div>

              {/* 角色标签 */}
              {role && (
                <Tag color="gold" style={{ fontSize: 11, margin: 0, marginBottom: 6 }}>
                  {ROLE_LABELS[role] || role}
                </Tag>
              )}

              {/* 退出提示 */}
              <div style={{
                fontSize: 11, color: T.textMuted, marginTop: 4,
                display: 'flex', alignItems: 'center',
              }}>
                <LogoutOutlined style={{ marginRight: 6, fontSize: 11 }} />
                退出登录
              </div>
            </>
          ) : (
            <UserOutlined style={{ color: '#D4AF37', fontSize: 16 }} />
          )}
        </div>
      </Sider>

      {/* Main content area */}
      <Layout style={{ background: T.bgRoot }}>
        {/* Top bar - breadcrumb + collapse trigger */}
        <Header className="gipfel-topbar" style={{
          background: T.panel,
          padding: '0 32px',
          height: 52,
          display: 'flex', alignItems: 'center',
          borderBottom: `1px solid ${T.border}`,
          gap: 16,
        }}>
          {/* 侧栏折叠按钮 */}
          <span
            onClick={toggleCollapse}
            style={{
              cursor: 'pointer',
              fontSize: 16,
              color: T.textSecondary,
              transition: 'color 150ms',
              lineHeight: '52px',
              flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.color = T.textPrimary }}
            onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.color = T.textSecondary }}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </span>

          <Breadcrumb items={breadcrumbItems} />

          {/* 全局搜索：合同/区域 (Ctrl+K) */}
          <GlobalSearch />

          {/* 通知中心：铃铛 + 未读红点 + 下拉面板 */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <NotificationBell />
          </div>
        </Header>

        {/* Content - 32px padding, responsive */}
        <Content className="gipfel-main-content" style={{
          padding: 32,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ flex: 1 }}>
            <Outlet />
          </div>

          {/* 底部版权 / 版本信息 */}
          <div style={{
            borderTop: `1px solid ${T.border}`,
            marginTop: 24,
            paddingTop: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            fontSize: 11,
            color: T.textMuted,
            lineHeight: 1.55,
          }}>
            <span>© 2026 Gipfel 机构平台 · 基础设施合同管理 + 区域模拟</span>
            <span>Institutional Platform · v1.1.0 · {authUser?.role === 'operator' ? '操作端' : authUser?.role === 'admin' ? '管理端' : '代表端只读视图'}</span>
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout
