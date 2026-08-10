import { queryOne, queryAll } from '../helpers'
import type { DashboardSummary, DashboardSystemStats } from '../../../shared/types'

export class DashboardRepository {
  getSummary(): DashboardSummary {
    const row = queryOne(`
      SELECT
        (SELECT COUNT(*) FROM regions) as total_regions,
        (SELECT COUNT(*) FROM contracts) as total_contracts,
        (SELECT COUNT(*) FROM companies WHERE is_active = 1) as total_companies,
        (SELECT COALESCE(SUM(total_land_area), 0) FROM contract_items) as total_land_area,
        (SELECT COALESCE(AVG(current_happiness), 0) FROM regions WHERE current_happiness IS NOT NULL) as avg_happiness,
        (SELECT COALESCE(AVG(current_employment_rate), 0) FROM regions WHERE current_employment_rate IS NOT NULL) as avg_employment,
        (SELECT COALESCE(SUM(total_cost), 0) FROM contracts) as total_contract_amount,
        (SELECT COALESCE(SUM(balance), 0) FROM region_accounts) as total_account_balance,
        (SELECT COUNT(*) FROM region_accounts) as total_accounts
    `)
    return {
      total_regions: Number(row?.total_regions ?? 0),
      total_contracts: Number(row?.total_contracts ?? 0),
      total_companies: Number(row?.total_companies ?? 0),
      total_land_area: Number(row?.total_land_area ?? 0),
      avg_happiness: Number(row?.avg_happiness ?? 0),
      avg_employment: Number(row?.avg_employment ?? 0),
      total_contract_amount: Number(row?.total_contract_amount ?? 0),
      total_account_balance: Number(row?.total_account_balance ?? 0),
      total_accounts: Number(row?.total_accounts ?? 0),
    }
  }

  /**
   * 系统概览统计（仅 admin）：用户数按角色拆分、活跃用户、今日登录、最近创建用户
   */
  getSystemStats(): DashboardSystemStats {
    const row = queryOne(`
      SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'admin') as admin_count,
        (SELECT COUNT(*) FROM users WHERE role = 'operator') as operator_count,
        (SELECT COUNT(*) FROM users WHERE role = 'rep') as rep_count,
        (SELECT COUNT(*) FROM users
           WHERE last_login IS NOT NULL
             AND last_login >= datetime('now','localtime','-30 days')) as active_users_30d,
        (SELECT COUNT(*) FROM audit_logs
           WHERE action = 'login' AND result = 'success'
             AND timestamp >= datetime('now','localtime','-24 hours')) as logins_24h
    `)
    const recentUsers = queryAll(
      `SELECT id, username, role, created_at, last_login
         FROM users
        ORDER BY created_at DESC, id DESC
        LIMIT 6`
    )
    return {
      total_users: Number(row?.total_users ?? 0),
      admin_count: Number(row?.admin_count ?? 0),
      operator_count: Number(row?.operator_count ?? 0),
      rep_count: Number(row?.rep_count ?? 0),
      active_users_30d: Number(row?.active_users_30d ?? 0),
      logins_24h: Number(row?.logins_24h ?? 0),
      recent_users: recentUsers.map((u: any) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        created_at: u.created_at,
        last_login: u.last_login,
      })),
    }
  }
}
