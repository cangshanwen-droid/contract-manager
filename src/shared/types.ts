// ---- 数据库实体接口 ----

export type ContractStatus = 'draft' | 'active' | 'completed' | 'terminated' | 'expired'

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
  party_a: string
  party_b_id: number | null
  party_b_name: string
  region_id: number | null
  region_name?: string
  sign_date: string | null
  status: ContractStatus
  notes: string
  created_at: string
  updated_at: string
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
}

export interface ContractWithItems extends Contract {
  items: ContractItem[]
}

export interface Company {
  id: number
  name: string
  region: string
  company_type: string
  contact: string
  phone: string
  email: string
  address: string
  notes: string
  is_active: number
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
