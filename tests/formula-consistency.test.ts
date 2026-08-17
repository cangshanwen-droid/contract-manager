import { describe, expect, it } from 'vitest'
import { calculateFormulas } from '../src/main/ipc/formula.handler'
import type { FormulaInput } from '../src/shared/types'

const base: FormulaInput = {
  region_id: 1,
  population: 1000,
  talent_population: 100,
  carbon_emissions: 500,
  supply_quantity: 100,
  demand_quantity: 100,
  prev_avg_price: 10,
  current_avg_price: 11,
  base_cost: 10,
  base_profit: 2,
  infra_employment_bonuses: [],
  infra_population_delta: 0,
  population_capacity: 5000,
  base_growth_rate: 0.03,
  infra_carbon_reduction: 200,
}

describe('区域指标统一公式', () => {
  it('碳排放按人口排放、开采排放和减排值统一计算', () => {
    const output = calculateFormulas(base)
    expect(output.population_carbon).toBe(0)
    expect(output.remaining_extraction_carbon).toBe(300)
    expect(output.total_carbon).toBe(300)
    expect(output.happiness).toBeCloseTo(10.4413926852, 8)
  })

  it('更高碳排放降低幸福度而不是提高幸福度', () => {
    const lower = calculateFormulas({ ...base, carbon_emissions: 100 })
    const higher = calculateFormulas({ ...base, carbon_emissions: 2000 })
    expect(higher.happiness).toBeLessThan(lower.happiness)
    expect(lower.happiness).toBeCloseTo(11.0413926852, 8)
    expect(higher.happiness).toBeCloseTo(7.4413926852, 8)
  })
})
