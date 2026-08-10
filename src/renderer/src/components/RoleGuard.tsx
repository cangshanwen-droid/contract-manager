/**
 * RoleGuard — 路由权限守卫（角色 + 权限点双重校验）
 *
 * 每个路由先按角色过滤（ROLE_ROUTES），再按权限点校验
 * （有权限点映射的路由必须同时通过两道检查）：
 *  - contracts    → contract.view
 *  - accounts     → account.view
 *  - stocks       → stock.trade
 *  - announcements→ announce.manage
 *  - users        → user.manage
 *  - settings     → system.config
 * 无权限点映射的路由（regions/companies/calculate 等）仅按角色校验。
 */

import React from 'react'
import { Navigate } from 'react-router-dom'
import { Result, Button } from 'antd'
import { useAuth } from '../context/AuthContext'
import { PERMISSIONS } from '../../../shared/permissions'

/** 各角色可访问的路由前缀集合（第一道：角色） */
const ROLE_ROUTES: Record<string, Set<string>> = {
  // rep: 只读权限 — 仪表盘 + 合同总览(只读) + 资金总览(只读) + 本公司股票(只读)
  rep: new Set(['dashboard', 'contracts', 'accounts', 'stocks']),
  operator: new Set([
    'dashboard',
    'regions', 'contracts', 'companies',
    'calculate', 'infra-calc', 'land-area',
    'accounts', 'stocks', 'announcements',
  ]),
  admin: new Set([
    'dashboard',
    'regions', 'contracts', 'companies',
    'calculate', 'infra-calc', 'land-area',
    'infrastructure', 'accounts', 'gipfel', 'stocks', 'settings', 'users', 'announcements',
    'account-monitor',
  ]),
}

/** 路由 → 权限点映射（第二道：权限点）
 *  stocks 不在其中：页面内部按角色渲染（rep 只读视图 / operator·admin 完整视图），
 *  路由可达性已由 ROLE_ROUTES 控制。 */
const ROUTE_PERMISSIONS: Record<string, string> = {
  contracts: PERMISSIONS.CONTRACT_VIEW,
  accounts: PERMISSIONS.ACCOUNT_VIEW,
  announcements: PERMISSIONS.ANNOUNCE_MANAGE,
  users: PERMISSIONS.USER_MANAGE,
  settings: PERMISSIONS.SYSTEM_CONFIG,
}

interface Props {
  children: React.ReactNode
  /** 当前路由路径片段，如 'contracts' */
  route: string
}

const RoleGuard: React.FC<Props> = ({ children, route }) => {
  const user = useAuth()
  const role = user?.role || 'rep'
  const allowedRoutes = ROLE_ROUTES[role] || ROLE_ROUTES.rep

  // 第一道：角色路由集合
  if (!allowedRoutes.has(route)) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="您没有访问此页面的权限"
        extra={
          <Button type="primary" onClick={() => window.location.hash = '#/dashboard'}>
            返回首页
          </Button>
        }
        style={{ paddingTop: 80 }}
      />
    )
  }

  // 第二道：权限点（若该路由有权限点映射）
  const required = ROUTE_PERMISSIONS[route]
  if (required && !(user && Array.isArray(user.permissions) && user.permissions.includes(required))) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="您没有访问此页面的权限"
        extra={
          <Button type="primary" onClick={() => window.location.hash = '#/dashboard'}>
            返回首页
          </Button>
        }
        style={{ paddingTop: 80 }}
      />
    )
  }

  return <>{children}</>
}

export default RoleGuard
