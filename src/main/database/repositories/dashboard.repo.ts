import { queryOne } from '../helpers'
import type { DashboardSummary } from '../../../shared/types'

export class DashboardRepository {
  getSummary(): DashboardSummary {
    const row = queryOne(`
      SELECT
        (SELECT COUNT(*) FROM regions) as total_regions,
        (SELECT COUNT(*) FROM contracts) as total_contracts,
        (SELECT COUNT(*) FROM companies WHERE is_active = 1) as total_companies,
        (SELECT COALESCE(SUM(total_land_area), 0) FROM contract_items) as total_land_area,
        (SELECT COALESCE(AVG(current_happiness), 0) FROM regions WHERE current_happiness IS NOT NULL) as avg_happiness,
        (SELECT COALESCE(AVG(current_employment_rate), 0) FROM regions WHERE current_employment_rate IS NOT NULL) as avg_employment
    `)
    return {
      total_regions: Number(row?.total_regions ?? 0),
      total_contracts: Number(row?.total_contracts ?? 0),
      total_companies: Number(row?.total_companies ?? 0),
      total_land_area: Number(row?.total_land_area ?? 0),
      avg_happiness: Number(row?.avg_happiness ?? 0),
      avg_employment: Number(row?.avg_employment ?? 0)
    }
  }
}
