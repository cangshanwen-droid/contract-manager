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
      // P1-1 扩展：Dashboard 合同状态分布/待审批/最近活动，不再由渲染端拉 CONTRACT_LIST 全表
      contract_status_counts: this.getContractStatusCounts(),
      contract_approval_pending: this.getApprovalPendingCount(),
      recent_contracts: this.getRecentContracts(),
    }
  }

  /** P1-1：合同状态分布（GROUP BY status） */
  private getContractStatusCounts(): Record<string, number> {
    const rows = queryAll('SELECT status, COUNT(*) as cnt FROM contracts GROUP BY status')
    const counts: Record<string, number> = {}
    for (const r of rows) {
      counts[String(r.status || 'draft')] = Number(r.cnt ?? 0)
    }
    return counts
  }

  /** P1-1：待审批合同数（operator 待办工作台） */
  private getApprovalPendingCount(): number {
    const row = queryOne(`SELECT COUNT(*) as cnt FROM contracts WHERE approval_status = 'pending'`)
    return Number(row?.cnt ?? 0)
  }

  /** P1-1：最近 6 条合同（Dashboard 最近活动列表） */
  private getRecentContracts(): DashboardSummary['recent_contracts'] {
    const rows = queryAll(
      `SELECT id, contract_no, contract_name, status, created_at
         FROM contracts
        ORDER BY created_at DESC, id DESC
        LIMIT 6`
    )
    return rows.map((r) => ({
      id: Number(r.id),
      contract_no: String(r.contract_no ?? ''),
      contract_name: String(r.contract_name ?? ''),
      status: String(r.status ?? 'draft'),
      created_at: String(r.created_at ?? ''),
    }))
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
