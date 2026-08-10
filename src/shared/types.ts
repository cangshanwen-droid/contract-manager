// ---- 数据库实体接口 ----

export type ContractStatus = 'draft' | 'active' | 'completed' | 'terminated' | 'expired'
// 审批状态：none=未提交审批(草稿) pending=待审批 approved=已审批 rejected=已驳回
export type ApprovalStatus = 'none' | 'pending' | 'approved' | 'rejected'
export type ContractApprovalAction = 'submit' | 'approve' | 'reject'

export interface Region {
  id: number
  name: string
  population: number
  talent_population: number
  carbon_emissions: number
  population_capacity: number
  base_growth_rate: number
  current_happiness: number | null
  current_employment_rate: number | null
  created_at: string
  updated_at: string
}

export interface Contract {
  id: number
  contract_no: string
  contract_name: string
  contract_type_id: number
  contract_type_name?: string
  party_a: string
  party_b_id: number | null
  party_b_name: string
  company_name?: string
  region_id: number | null
  region_name?: string
  sign_date: string | null
  status: ContractStatus
  approval_status: ApprovalStatus
  approved_by: string
  approved_at: string | null
  notes: string
  total_cost: number
  progress: number
  expected_income: number
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface ContractType {
  id: number
  name: string
  description: string
  color: string
  sort_order: number
}

export interface ContractItem {
  id: number
  contract_id: number
  item_name: string
  quantity: number
  unit_price: number
  amount: number
  land_area: number
  total_land_area: number
  tax_rate: number
  tax_amount: number
  total: number
  sort_order: number
  skill_level: number
  carbon_factor: number
  // v8 迁移新增：明细级金额（投资合同=投资总额/预期收益、拨款合同=拨款金额），创建时可透传
  total_cost?: number
  expected_income?: number
}

export interface ContractWithItems extends Contract {
  items: ContractItem[]
}

export interface ContractVersion {
  id: number
  contract_id: number
  version: number
  snapshot: Record<string, unknown>
  changed_fields: string[]
  created_by: string
  created_at: string
}

export interface Company {
  id: number
  name: string
  region: string
  region_id: number | null
  region_name?: string
  company_type: string
  contact: string
  phone: string
  email: string
  address: string
  notes: string
  employee_count: number
  annual_output: number
  carbon_emission: number
  is_active: number
  is_listed: number
  stock_symbol: string
  stock_initial_price: number
  created_at: string
  updated_at: string
}

export interface InfrastructureType {
  id: number
  name: string
  default_land_area: number
  unit: string
  description: string
  price: number
  revenue_index: number
  recommended_ratio: number
  maintenance_fee: number
  category: string
  population_addition: number
  talent_addition: number
  happiness_index: number
  h_bonus: number
  carbon_reduction: number
  activation_price: number
}

export interface FormulaLog {
  id: number
  region_id: number
  region_name?: string
  round: number
  calculated_at: string
  input_population: number
  input_talent: number
  input_carbon: number
  input_supply: number
  input_demand: number
  input_price_avg: number
  output_happiness: number
  output_base_price: number
  output_sell_price: number
  output_employment_rate: number
  output_population_next: number
}

// ---- IPC 请求/响应类型 ----

export interface PaginationRequest {
  page: number
  pageSize: number
  sortField?: string
  sortOrder?: 'ascend' | 'descend'
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface DashboardSummary {
  total_regions: number
  total_contracts: number
  total_companies: number
  total_land_area: number
  avg_happiness: number | null
  avg_employment: number | null
  total_contract_amount: number
  total_account_balance: number
  total_accounts: number
}

/** 系统概览（仅 admin）：用户构成 + 活跃度 + 最近创建用户 */
export interface DashboardSystemStats {
  total_users: number
  admin_count: number
  operator_count: number
  rep_count: number
  active_users_30d: number
  logins_24h: number
  recent_users: {
    id: number
    username: string
    role: string
    created_at: string | null
    last_login: string | null
  }[]
}

/** 服务器状态：云端 API / 股票 API 健康检查 */
export interface ServiceHealthItem {
  name: string
  ok: boolean
  latency_ms: number | null
  message?: string
}

export interface SystemHealth {
  cloud_api: ServiceHealthItem
  stock_api: ServiceHealthItem
  db_ok: boolean
  checked_at: string
}

export interface TrendDataPoint {
  label: string
  value: number
}

// ---- 公式计算输入/输出 ----

export interface FormulaInput {
  region_id: number
  population: number
  talent_population: number
  carbon_emissions: number
  supply_quantity: number
  demand_quantity: number
  prev_avg_price: number
  current_avg_price: number
  base_cost: number
  base_profit: number
  infra_employment_bonuses: { name: string; bonus: number }[]
  infra_population_delta: number
  population_capacity: number
  base_growth_rate: number
}

export interface FormulaOutput {
  consumer_satisfaction: number
  price_sensitivity: number
  market_demand: number
  happiness: number
  base_price: number
  sell_price: number
  base_employment_rate: number
  infra_employment_bonus_total: number
  actual_infra_employment_bonus: number
  total_employment_rate: number
  next_population: number
}

export interface AuditLog {
  id: number
  username: string
  role: string
  action: string
  target: string
  target_id: number | null
  old_value: string | null
  new_value: string | null
  ip: string | null
  timestamp: string
  result: string
}

// ---- 通知中心 ----

/** 通知类型：approval(审批) | announcement(公告) | transaction(交易) | system(系统) */
export type NotificationType = 'approval' | 'announcement' | 'transaction' | 'system'

export interface AppNotification {
  id: number
  user_id: number
  title: string
  content: string
  type: NotificationType
  link: string
  read: number
  created_at: string
}
