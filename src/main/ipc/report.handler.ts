import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { queryAll } from '../database/helpers'

export function registerReportHandlers(): void {
  // 按基建类型汇总占地面积
  ipcMain.handle(IPC_CHANNELS.REPORT_LAND_AREA, () => {
    return queryAll(`
      SELECT
        r.name as region_name,
        ci.item_name,
        SUM(ci.quantity) as total_quantity,
        SUM(ci.total_land_area) as total_land_area
      FROM contract_items ci
      JOIN contracts c ON c.id = ci.contract_id
      JOIN regions r ON r.id = c.region_id
      WHERE ci.total_land_area > 0
      GROUP BY r.name, ci.item_name
      ORDER BY r.name, total_land_area DESC
    `)
  })

  // 按区域汇总占地面积
  ipcMain.handle(IPC_CHANNELS.REPORT_LAND_AREA_BY_REGION, () => {
    return queryAll(`
      SELECT
        r.name as region_name,
        COUNT(DISTINCT c.id) as contract_count,
        SUM(ci.quantity) as total_items,
        SUM(ci.total_land_area) as total_land_area
      FROM contract_items ci
      JOIN contracts c ON c.id = ci.contract_id
      JOIN regions r ON r.id = c.region_id
      WHERE ci.total_land_area > 0
      GROUP BY r.name
      ORDER BY total_land_area DESC
    `)
  })
}
