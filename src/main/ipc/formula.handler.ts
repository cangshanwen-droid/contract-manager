import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { getDatabase } from '../database/connection'
import { queryAll, queryOne } from '../database/helpers'
import { syncStockPrices } from '../stock-sync'
import type { FormulaInput, FormulaOutput } from '../../shared/types'

function calculateFormulas(input: FormulaInput): FormulaOutput {
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
    base_growth_rate
  } = input

  // 消费者满足度 c = Qs / Qd
  const consumer_satisfaction =
    demand_quantity > 0 ? supply_quantity / demand_quantity : 0

  // 价格敏感系数 β = 1 - 上期均价 / 本期均价
  const price_sensitivity =
    current_avg_price > 0 ? 1 - prev_avg_price / current_avg_price : 0

  // 市场需求量 Qd = β * P
  const market_demand = price_sensitivity * population

  // 区域幸福度综合公式
  const talentRatio = population > 0 ? talent_population / population : 0
  const carbonPerCapita = population > 0 ? carbon_emissions / population : 0

  const happiness =
    0.6 * consumer_satisfaction +
    0.1 * Math.log10(population + 100) +
    0.2 * talentRatio +
    -0.2 * carbonPerCapita

  const clampedHappiness = Math.max(1, Math.min(100, happiness * 10))

  // 基准价格
  const base_price = base_cost + base_profit

  // 商品成交价
  const qd_max = population * 2
  const sell_price =
    base_price *
    (1 + clampedHappiness / 100) *
    (1 + (market_demand - supply_quantity) / Math.max(qd_max, 1))

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
  const natural_growth = population * base_growth_rate * (clampedHappiness / 100)
  const raw_growth = natural_growth + infra_population_delta
  const capacity_factor = Math.max(0, 1 - population / Math.max(population_capacity, 1))
  const population_change = raw_growth * capacity_factor
  const next_population = Math.min(population + population_change, population_capacity)

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
    next_population
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
           population = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
          [output.happiness, output.total_employment_rate, Math.round(output.next_population), input.region_id]
        )

        db.run('COMMIT')

        // 同步股价到股票交易系统（异步，不阻塞）
        try {
          const region = queryOne('SELECT name, population FROM regions WHERE id = ?', [input.region_id]) as any
          if (region) {
            syncStockPrices({
              regionName: region.name,
              happiness: output.happiness,
              carbonEmissions: input.carbon_emissions,
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
