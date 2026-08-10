import React, { createContext, useContext } from 'react'

export interface AuthUser {
  id: number
  username: string
  role: string
  /** 权限点列表（登录时由主进程根据 roles 表计算） */
  permissions: string[]
}

const AuthContext = createContext<AuthUser | null>(null)

export function useAuth(): AuthUser | null {
  return useContext(AuthContext)
}

/** 当前用户是否拥有某权限点（前端按钮级校验） */
export function usePermission(permission: string): boolean {
  const user = useAuth()
  return !!user && Array.isArray(user.permissions) && user.permissions.includes(permission)
}

export const AuthProvider: React.FC<{ user: AuthUser; children: React.ReactNode }> = ({ user, children }) => {
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>
}
