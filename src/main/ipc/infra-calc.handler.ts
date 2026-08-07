import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { queryAll } from '../database/helpers'

export function registerInfraCalcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.INFRA_CALC_LOAD,
    (_e, regionId: number) => {
      const types = queryAll(
        'SELECT * FROM infrastructure_types ORDER BY recommended_ratio DESC'
      )

      // 获取该区域合同中已建的基建数量
      const built = queryAll(
        `SELECT ci.item_name, SUM(ci.quantity) as total_qty
         FROM contract_items ci
         JOIN contracts c ON c.id = ci.contract_id
         WHERE c.region_id = ? AND ci.land_area >= 0
         GROUP BY ci.item_name`,
        [regionId]
      )

      const qtyMap: Record<string, number> = {}
      for (const b of built) {
        qtyMap[b.item_name as string] = (b.total_qty as number) || 0
      }

      const region = queryAll('SELECT population FROM regions WHERE id = ?', [regionId])
      const population = region.length > 0 ? Number(region[0].population) : 0

      let totalCurrent = 0
      for (const t of types) {
        totalCurrent += qtyMap[t.name as string] || 0
      }

      // 基础碳排放 = 人口 × 10
      const baselineCarbon = population * 10

      // 组装计算结果
      const result = types.map((t) => {
        const name = t.name as string
        const currentQty = qtyMap[name] || 0
        const ratio = t.recommended_ratio as number
        const price = t.price as number
        const revenueIndex = t.revenue_index as number
        const maintenanceFee = t.maintenance_fee as number
        const landArea = t.default_land_area as number
        const category = t.category as string
        const carbonReduction = t.carbon_reduction as number || 0
        const activationPrice = t.activation_price as number || 0

        const suggestedQty = Math.round(population * ratio)
        const gap = Math.max(0, suggestedQty - currentQty)
        const currentRatio = totalCurrent > 0 ? currentQty / totalCurrent : 0
        const annualRevenue = revenueIndex * currentQty
        const totalMaintenance = maintenanceFee * currentQty
        const buildCost = price * gap

        // 产业配套基建：需要支付使用费才产生减排
        // 模拟假设已激活的数量 = 当前数量的一半（简化处理）
        const activatedQty = category === '产业配套' ? currentQty : 0
        const annualUsageFee = activationPrice * activatedQty
        const actualCarbonReduction = category === '产业配套' ? carbonReduction * currentQty : 0
        const netOperatingCost = totalMaintenance + annualUsageFee - annualRevenue

        return {
          name,
          category,
          land_area: landArea,
          price,
          revenue_index: revenueIndex,
          recommended_ratio: ratio,
          maintenance_fee: maintenanceFee,
          current_qty: currentQty,
          current_ratio: currentRatio,
          suggested_qty: suggestedQty,
          gap,
          annual_revenue: annualRevenue,
          total_maintenance: totalMaintenance,
          build_cost: buildCost,
          population_addition: t.population_addition,
          talent_addition: t.talent_addition,
          happiness_index: t.happiness_index,
          h_bonus: t.h_bonus,
          carbon_reduction: carbonReduction,
          activation_price: activationPrice,
          annual_usage_fee: annualUsageFee,
          actual_carbon_reduction: actualCarbonReduction,
          net_operating_cost: netOperatingCost
        }
      })

      // 汇总碳排放
      const totalCarbonReduction = result.reduce(
        (sum, r) => sum + r.actual_carbon_reduction, 0
      )
      // 最低抵扣下限 2000
      const effectiveCarbonReduction = Math.max(2000, totalCarbonReduction)
      const netCarbonEmission = Math.max(0, baselineCarbon - effectiveCarbonReduction)

      const summary = {
        population,
        baseline_carbon: baselineCarbon,
        total_current: totalCurrent,
        total_revenue: result.reduce((s, r) => s + r.annual_revenue, 0),
        total_maintenance: result.reduce((s, r) => s + r.total_maintenance, 0),
        total_build_cost: result.reduce((s, r) => s + r.build_cost, 0),
        total_carbon_reduction: totalCarbonReduction,
        effective_carbon_reduction: effectiveCarbonReduction,
        net_carbon_emission: netCarbonEmission,
        total_usage_fee: result.reduce((s, r) => s + r.annual_usage_fee, 0),
        items: result
      }

      return summary
    }
  )
}
