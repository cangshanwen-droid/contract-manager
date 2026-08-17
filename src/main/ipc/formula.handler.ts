import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { getDatabase } from '../database/connection'
import { queryAll, queryOne } from '../database/helpers'
import { syncStockPrices } from '../stock-sync'
import type { FormulaInput, FormulaOutput } from '../../shared/types'

export function calculateFormulas(input: FormulaInput): FormulaOutput {
  const {
    population,
    talent_population,
    carbon_emissions,
    supply_quantity,
    demand_quantity,
    prev_avg_price,
    current_avg_price,
    base_cost,
    base_profit,
    infra_employment_bonuses,
    infra_population_delta,
    population_capacity,
    base_growth_rate,
    infra_carbon_reduction
  } = input

  // 消费者满足度 c = Qs / Qd
  const consumer_satisfaction =
    demand_quantity > 0 ? supply_quantity / demand_quantity : 0

  // 价格敏感系数 β = 1 - 上期均价 / 本期均价
  const price_sensitivity =
    current_avg_price > 0 ? 1 - prev_avg_price / current_avg_price : 0

  // 市场需求量 Qd = β * P
  const market_demand = price_sensitivity * population

  // 统一碳排放口径：区域碳排放 - 基建减排（不重复叠加人口，也不附加显示单位）
  const population_carbon = 0
  const extraction_carbon = Math.max(0, carbon_emissions)
  const effective_carbon_reduction = Math.max(0, infra_carbon_reduction || 0)
  const remaining_extraction_carbon = Math.max(0, extraction_carbon - effective_carbon_reduction)
  const total_carbon = Math.max(0, population_carbon + remaining_extraction_carbon)

  // 区域幸福度综合公式：人才提高幸福度，单位人口碳排放降低幸福度。
  const talentRatio = population > 0 ? talent_population / population : 0
  const carbonPerCapita = population > 0 ? total_carbon / population : 0

  const happiness =
    0.6 * consumer_satisfaction +
    0.1 * Math.log10(population + 100) +
    2 * talentRatio -
    0.2 * carbonPerCapita

  const clampedHappiness = Math.max(1, Math.min(100, happiness * 10))

  // 基准价格
  const base_price = base_cost + base_profit

  // 商品成交价
  const qd_max = Math.max(population * 2, 1)
  // P1-4 供需因子下限 -0.9（供≫求×小人口时不再出现负价），上限 2 防止需求极端时价格失控；
  // 最终成交价 clamp 到 [0.01, 99999]
  const supplyDemandFactor = Math.max(-0.9, Math.min(2, (market_demand - supply_quantity) / Math.max(qd_max, 1)))
  const sell_price = Math.min(99999, Math.max(0.01,
    base_price *
    (1 + clampedHappiness / 100) *
    (1 + supplyDemandFactor)
  ))

  // 就业率
  const base_employment_rate = 5 * Math.log10(population + 100)
  const infra_employment_bonus_total = infra_employment_bonuses.reduce(
    (sum, item) => sum + item.bonus,
    0
  )
  const actual_infra_employment_bonus =
    (25 * infra_employment_bonus_total) / (infra_employment_bonus_total + 30)
  const total_employment_rate = base_employment_rate + actual_infra_employment_bonus

  // 人口迭代
  // P1-5 下期人口下限 0：负增长率长期迭代不再产生负人口；增长率 clamp [-0.5, 0.5]；
  // 容量为空/NULL 时兜底为 10000（Math.max(1, …) 防 0/NaN 容量导致人口被清空）
  const pop = Number.isFinite(population) ? population : 0
  const capacity = Number.isFinite(population_capacity) ? Math.max(1, population_capacity) : 10000
  const growthRate = Number.isFinite(base_growth_rate) ? Math.max(-0.5, Math.min(0.5, base_growth_rate)) : 0
  const natural_growth = pop * growthRate * (clampedHappiness / 100)
  const raw_growth = natural_growth + (Number.isFinite(infra_population_delta) ? infra_population_delta : 0)
  const capacity_factor = Math.max(0, 1 - pop / capacity)
  const population_change = raw_growth * capacity_factor
  const next_population = Math.max(0, Math.min(pop + population_change, capacity))

  return {
    consumer_satisfaction,
    price_sensitivity,
    market_demand,
    happiness: clampedHappiness,
    base_price,
    sell_price,
    base_employment_rate,
    infra_employment_bonus_total,
    actual_infra_employment_bonus,
    total_employment_rate,
    next_population,
    population_carbon,
    extraction_carbon,
    infra_carbon_reduction: effective_carbon_reduction,
    remaining_extraction_carbon,
    total_carbon
  }
}

export function registerFormulaHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORMULA_CALCULATE,
    (_e, input: FormulaInput): FormulaOutput => {
      try {
        const output = calculateFormulas(input)
        const db = getDatabase()

        db.run('BEGIN TRANSACTION')

        const logRows = queryAll(
          'SELECT COALESCE(MAX(round), 0) as mr FROM formula_logs WHERE region_id = ?',
          [input.region_id]
        )
        const nextRound = (logRows[0]?.mr as number ?? 0) + 1

        db.run(
          `INSERT INTO formula_logs
            (region_id, round, input_population, input_talent, input_carbon,
             input_supply, input_demand, input_price_avg,
             output_happiness, output_base_price, output_sell_price,
             output_employment_rate, output_population_next)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.region_id, nextRound,
            input.population, input.talent_population, input.carbon_emissions,
            input.supply_quantity, input.demand_quantity, input.current_avg_price,
            output.happiness, output.base_price, output.sell_price,
            output.total_employment_rate, Math.round(output.next_population)
          ]
        )

        db.run(
          `UPDATE regions SET current_happiness = ?, current_employment_rate = ?,
           population = ?, carbon_emissions = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
          [output.happiness, output.total_employment_rate, Math.round(output.next_population), output.total_carbon, input.region_id]
        )

        db.run('COMMIT')

        // 同步股价到股票交易系统（异步，不阻塞）
        try {
          const region = queryOne('SELECT name, population FROM regions WHERE id = ?', [input.region_id]) as any
          if (region) {
            syncStockPrices({
              regionName: region.name,
              happiness: output.happiness,
              carbonEmissions: output.total_carbon,
              population: Math.round(output.next_population),
              prevPopulation: input.population,
            }).catch(e => console.error('Stock sync failed:', e))
          }
        } catch { /* sync failure should not break formula */ }

        return output
      } catch (e: any) {
        try { getDatabase().run('ROLLBACK') } catch { /* ignore */ }
        console.error('FORMULA_CALCULATE failed:', e)
        return { success: false, message: `模拟计算失败：${e.message || '未知错误'}` } as any
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.FORMULA_LOG_LIST, (_e, regionId: number) => {
    try {
      return queryAll(
        `SELECT fl.*, r.name as region_name
         FROM formula_logs fl
         JOIN regions r ON r.id = fl.region_id
         WHERE fl.region_id = ?
         ORDER BY fl.round ASC`,
        [regionId]
      )
    } catch (err: any) {
      console.error('FORMULA_LOG_LIST failed:', err)
      return { success: false, message: `获取模拟日志失败：${err.message || '未知错误'}` }
    }
  })
}
