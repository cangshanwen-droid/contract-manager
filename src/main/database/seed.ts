import { getDatabase } from './connection'

export function seedDefaultData(): void {
  const db = getDatabase()

  // P1-4：seed 全量批量写入包事务（BEGIN…COMMIT 合并落盘）。
  // 修复前 32 条基建 + 8 合同类型 + 3 区域 + 4 公司 + 若干合同/明细/账户
  // 每条 db.run 都触发一次全量 export + 写盘（~80 次），改为事务内合并、COMMIT 后一次性落盘。
  db.run('BEGIN TRANSACTION')
  try {

  // 基建类型（民生配套22种 + 产业配套10种，来自基建影响指标表）
  const infraTypes: {
    name: string; cat: string; bonus: number; pop_add: number; talent: number;
    price: number; land: number; revenue: number; happy: number; h_bonus: number;
    carbon: number; act_price: number; ratio: number; unit: string; desc: string
  }[] = [
    // === 民生配套类（22种）===
    { name:'邮局', cat:'民生配套', bonus:0.4, pop_add:80, talent:0, price:30000, land:1100, revenue:5, happy:15, h_bonus:1.3, carbon:0, act_price:0, ratio:0.02, unit:'座', desc:'邮政服务设施' },
    { name:'停车场（小）', cat:'民生配套', bonus:0.6, pop_add:300, talent:0, price:150000, land:2600, revenue:30, happy:117, h_bonus:2.8, carbon:0, act_price:0, ratio:0.02, unit:'个', desc:'小型停车场' },
    { name:'停车场（大）', cat:'民生配套', bonus:1.8, pop_add:1200, talent:0, price:800000, land:7800, revenue:30, happy:720, h_bonus:5.4, carbon:0, act_price:0, ratio:0.008, unit:'个', desc:'大型停车场' },
    { name:'公共自行车租赁点', cat:'民生配套', bonus:0.5, pop_add:200, talent:0, price:100000, land:200, revenue:5, happy:94.9, h_bonus:2.6, carbon:0, act_price:0, ratio:0.02, unit:'个', desc:'公共自行车租赁' },
    { name:'报刊亭', cat:'民生配套', bonus:0.3, pop_add:50, talent:0, price:40000, land:20, revenue:6, happy:33.8, h_bonus:1.8, carbon:0, act_price:0, ratio:0.01, unit:'个', desc:'报刊零售亭' },
    { name:'自动售货机', cat:'民生配套', bonus:0.2, pop_add:20, talent:0, price:25000, land:7, revenue:15, happy:9.8, h_bonus:1, carbon:0, act_price:0, ratio:0.04, unit:'台', desc:'自动售货机' },
    { name:'路灯（组）', cat:'民生配套', bonus:0.3, pop_add:30, talent:0, price:20000, land:12, revenue:0, happy:19, h_bonus:1.4, carbon:0, act_price:0, ratio:0.43, unit:'组', desc:'道路照明路灯' },
    { name:'公共厕所', cat:'民生配套', bonus:0.7, pop_add:250, talent:0, price:100000, land:130, revenue:0, happy:98, h_bonus:2.7, carbon:0, act_price:0, ratio:0.015, unit:'座', desc:'公共卫生间' },
    { name:'垃圾站', cat:'民生配套', bonus:0.8, pop_add:180, talent:0, price:200000, land:380, revenue:0, happy:194, h_bonus:3.2, carbon:0, act_price:0, ratio:0.022, unit:'座', desc:'垃圾收集站' },
    { name:'交通信号灯', cat:'民生配套', bonus:0.1, pop_add:10, talent:0, price:2000, land:8, revenue:1, happy:0, h_bonus:0.6, carbon:0, act_price:0, ratio:0.025, unit:'组', desc:'交通信号灯组' },
    { name:'公交站台', cat:'民生配套', bonus:0.4, pop_add:40, talent:0, price:25000, land:48, revenue:0, happy:25, h_bonus:1.5, carbon:0, act_price:0, ratio:0.04, unit:'个', desc:'公交车站台' },
    { name:'公共座椅', cat:'民生配套', bonus:0.1, pop_add:5, talent:0, price:1000, land:4, revenue:0, happy:1, h_bonus:0.6, carbon:0, act_price:0, ratio:0.1, unit:'个', desc:'公共休息座椅' },
    { name:'监控电子眼', cat:'民生配套', bonus:0.1, pop_add:0, talent:0, price:2000, land:3, revenue:0, happy:0, h_bonus:0.6, carbon:0, act_price:0, ratio:0.18, unit:'个', desc:'监控摄像头' },
    { name:'公园（小）', cat:'民生配套', bonus:2.2, pop_add:5000, talent:0, price:1000000, land:13000, revenue:2, happy:988, h_bonus:7.9, carbon:0, act_price:0, ratio:0.014, unit:'个', desc:'小型社区公园' },
    { name:'公园（大）', cat:'民生配套', bonus:5, pop_add:22000, talent:0, price:5000000, land:42000, revenue:5, happy:4935, h_bonus:11.1, carbon:0, act_price:0, ratio:0.006, unit:'个', desc:'大型综合公园' },
    { name:'健身器材', cat:'民生配套', bonus:0.3, pop_add:30, talent:0, price:9000, land:100, revenue:0, happy:9, h_bonus:1, carbon:0, act_price:0, ratio:0.012, unit:'套', desc:'户外健身器材' },
    { name:'图书馆（小）', cat:'民生配套', bonus:2.8, pop_add:8000, talent:5, price:1500000, land:3400, revenue:10, happy:1465, h_bonus:9, carbon:0, act_price:0, ratio:0.004, unit:'座', desc:'小型图书馆' },
    { name:'图书馆（大）', cat:'民生配套', bonus:4.2, pop_add:18000, talent:10, price:3500000, land:9800, revenue:20, happy:3435, h_bonus:10.7, carbon:0, act_price:0, ratio:0.003, unit:'座', desc:'大型图书馆' },
    { name:'游泳馆', cat:'民生配套', bonus:3, pop_add:4500, talent:2, price:9000000, land:6500, revenue:45, happy:845, h_bonus:7, carbon:0, act_price:0, ratio:0.005, unit:'座', desc:'游泳馆' },
    { name:'体育场', cat:'民生配套', bonus:6, pop_add:45000, talent:3, price:10000000, land:33000, revenue:60, happy:9925, h_bonus:12.8, carbon:0, act_price:0, ratio:0.006, unit:'座', desc:'体育场' },
    { name:'剧院', cat:'民生配套', bonus:8, pop_add:120000, talent:10, price:30000000, land:15500, revenue:90, happy:29870, h_bonus:16.4, carbon:0, act_price:0, ratio:0.003, unit:'座', desc:'剧院' },
    { name:'学校', cat:'民生配套', bonus:9, pop_add:200000, talent:20, price:50000000, land:88000, revenue:150, happy:49790, h_bonus:17.7, carbon:0, act_price:0, ratio:0.018, unit:'座', desc:'学校' },
    // === 产业配套类（10种）===
    { name:'分类垃圾桶', cat:'产业配套', bonus:0.3, pop_add:0, talent:0, price:8000, land:5, revenue:0, happy:8, h_bonus:0, carbon:30, act_price:9860, ratio:0.005, unit:'组', desc:'分类垃圾桶' },
    { name:'节能路灯组', cat:'产业配套', bonus:0.6, pop_add:0, talent:0, price:30000, land:12, revenue:0, happy:22, h_bonus:0, carbon:80, act_price:36704, ratio:0.008, unit:'组', desc:'节能路灯组' },
    { name:'城市绿化带', cat:'产业配套', bonus:1.2, pop_add:0, talent:0, price:120000, land:2400, revenue:0, happy:110, h_bonus:0, carbon:200, act_price:126800, ratio:0.01, unit:'条', desc:'城市绿化带' },
    { name:'雨水回收系统', cat:'产业配套', bonus:1.5, pop_add:0, talent:1, price:250000, land:1700, revenue:0, happy:150, h_bonus:0, carbon:350, act_price:289900, ratio:0.006, unit:'套', desc:'雨水回收系统' },
    { name:'垃圾无害化处理站', cat:'产业配套', bonus:2.5, pop_add:0, talent:3, price:800000, land:7200, revenue:0, happy:320, h_bonus:0, carbon:900, act_price:911400, ratio:0.004, unit:'座', desc:'垃圾无害化处理站' },
    { name:'工业除尘设备', cat:'产业配套', bonus:3.2, pop_add:0, talent:4, price:1500000, land:3000, revenue:0, happy:480, h_bonus:0, carbon:1600, act_price:1792000, ratio:0.003, unit:'套', desc:'工业除尘设备' },
    { name:'污水处理厂', cat:'产业配套', bonus:4, pop_add:0, talent:6, price:3200000, land:21000, revenue:0, happy:960, h_bonus:0, carbon:3000, act_price:3702000, ratio:0.003, unit:'座', desc:'污水处理厂' },
    { name:'光伏充电站群', cat:'产业配套', bonus:4.5, pop_add:0, talent:5, price:5000000, land:14000, revenue:0, happy:1400, h_bonus:0, carbon:5000, act_price:5938000, ratio:0.002, unit:'座', desc:'光伏充电站群' },
    { name:'生态湿地公园', cat:'产业配套', bonus:7, pop_add:0, talent:8, price:12000000, land:68000, revenue:0, happy:3200, h_bonus:0, carbon:9000, act_price:2986000, ratio:0.002, unit:'个', desc:'生态湿地公园' },
    { name:'碳捕集净化中心', cat:'产业配套', bonus:8.5, pop_add:0, talent:12, price:28000000, land:36000, revenue:0, happy:6800, h_bonus:0, carbon:18000, act_price:3252000, ratio:0.001, unit:'座', desc:'碳捕集净化中心' }
  ]
  db.run('DELETE FROM infrastructure_types')
  db.run('DELETE FROM infra_employment_bonuses')
  const infraStmt = db.prepare(`
    INSERT INTO infrastructure_types
      (name, category, default_land_area, unit, description, price, revenue_index,
       recommended_ratio, maintenance_fee, population_addition, talent_addition,
       happiness_index, h_bonus, carbon_reduction, activation_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const t of infraTypes) {
    const mFee = Math.round(t.price * 0.02)
    infraStmt.bind([
      t.name, t.cat, t.land, t.unit, t.desc, t.price, t.revenue,
      t.ratio, mFee, t.pop_add, t.talent,
      t.happy, t.h_bonus, t.carbon, t.act_price
    ])
    infraStmt.step()
    infraStmt.reset()
  }

  // 就业率加成（从基建类型数据同步）
  const bonusStmt = db.prepare(
    `INSERT INTO infra_employment_bonuses (item_name, bonus) VALUES (?, ?)`
  )
  for (const t of infraTypes) {
    bonusStmt.bind([t.name, t.bonus])
    bonusStmt.step()
    bonusStmt.reset()
  }

  // 合同类型（8种）
  const existingCt = db.exec('SELECT COUNT(*) as cnt FROM contract_types')
  if (!existingCt.length || !(existingCt[0].values[0][0] as number)) {
    const ctData: [string, string, string, number][] = [
      ['基建合同', '基础设施施工建设', '#1890ff', 1],
      ['开采合同', '矿产/原材料开采', '#722ed1', 2],
      ['采购合同', '设备材料采购', '#fa8c16', 3],
      ['劳动力雇佣合同', '招聘人才、雇佣劳动力', '#52c41a', 4],
      ['投资合同', '项目投资', '#eb2f96', 5],
      ['拨款合同', '财政拨款', '#06b6d4', 6],
      ['销售合同', '商品销售', '#10b981', 7],
      ['减碳合同', '碳排放配额交易与减排', '#f59e0b', 8]
    ]
    for (const c of ctData) {
      db.run(
        `INSERT INTO contract_types (name, description, color, sort_order) VALUES (?, ?, ?, ?)`,
        c
      )
    }
  }

  // 示例区域
  const existing = db.exec('SELECT COUNT(*) as cnt FROM regions')
  if (!existing.length || !existing[0].values[0][0]) {
    db.run(
      `INSERT INTO regions (name, population, talent_population, carbon_emissions, population_capacity, base_growth_rate) VALUES (?, ?, ?, ?, ?, ?)`,
      ['A区', 50000, 5000, 1000, 100000, 0.03]
    )
    db.run(
      `INSERT INTO regions (name, population, talent_population, carbon_emissions, population_capacity, base_growth_rate) VALUES (?, ?, ?, ?, ?, ?)`,
      ['B区', 30000, 3000, 800, 80000, 0.03]
    )
    db.run(
      `INSERT INTO regions (name, population, talent_population, carbon_emissions, population_capacity, base_growth_rate) VALUES (?, ?, ?, ?, ?, ?)`,
      ['C区', 20000, 1500, 500, 50000, 0.03]
    )
  }

  // 示例公司
  const companies = [
    ['建设集团一公司', 'A区', 1, '施工方', '张三'],
    ['市政工程公司', 'B区', 2, '施工方', '李四'],
    ['设计研究院', 'A区', 1, '设计方', '王五'],
    ['设备供应公司', 'C区', 3, '供应商', '赵六']
  ]
  for (const comp of companies) {
    db.run(
      `INSERT OR IGNORE INTO companies (name, region, region_id, company_type, contact) VALUES (?, ?, ?, ?, ?)`,
      comp
    )
  }

  // 示例基建合同（生成占地面积报表用）
  const existingContracts = db.exec('SELECT COUNT(*) as cnt FROM contracts')
  if (!existingContracts.length || !existingContracts[0].values[0][0]) {
    const regRows = db.exec('SELECT id, name FROM regions')
    const regions = regRows[0].values.map((v, i) => ({ id: v[0] as number, name: regRows[0].values[i]?.[1] as string || '' }))
    // 简化处理：直接取所有区域
    const allRegions: { id: number; name: string }[] = []
    for (let i = 0; i < regRows[0].values.length; i++) {
      allRegions.push({ id: regRows[0].values[i][0] as number, name: regRows[0].values[i][1] as string })
    }

    // 为每个区域创建几个基建合同
    const contractData: { region_idx: number; items: [string, number, number, number][] }[] = [
      { region_idx: 0, items: [['路灯（组）', 500, 20000, 12], ['公园（小）', 2, 1000000, 13000], ['公交站台', 30, 25000, 48], ['公共座椅', 200, 1000, 4], ['邮局', 3, 30000, 1100]] },
      { region_idx: 1, items: [['路灯（组）', 300, 20000, 12], ['停车场（小）', 5, 150000, 2600], ['垃圾站', 2, 200000, 380], ['健身器材', 20, 9000, 100], ['学校', 1, 50000000, 88000]] },
      { region_idx: 2, items: [['路灯（组）', 200, 20000, 12], ['自动售货机', 50, 25000, 7], ['公共厕所', 3, 100000, 130], ['图书馆（小）', 1, 1500000, 3400]] }
    ]

    let seq = 0
    for (const cd of contractData) {
      if (cd.region_idx >= allRegions.length) continue
      const region = allRegions[cd.region_idx]
      seq++
      const contractNo = `CT-2026-${String(seq).padStart(4, '0')}`
      db.run(
        `INSERT INTO contracts (contract_no, contract_name, contract_type_id, region_id, status, sign_date)
         VALUES (?, ?, ?, ?, 'active', '2026-01-15')`,
        [contractNo, `${region.name}基础设施建设项目`, 1, region.id]
      )
      const cid = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number

      for (const item of cd.items) {
        const [name, qty, price, land] = item
        db.run(
          `INSERT INTO contract_items (contract_id, item_name, quantity, unit_price, land_area, tax_rate, sort_order)
           VALUES (?, ?, ?, ?, ?, 0, 0)`,
          [cid, name, qty, price, land]
        )
      }
    }
  }

  // 区域财务账户
  const existAccounts = db.exec('SELECT COUNT(*) as cnt FROM region_accounts')
  if (!existAccounts.length || !(existAccounts[0].values[0][0] as number)) {
    const regRows = db.exec('SELECT id, name FROM regions')
    for (let i = 0; i < regRows[0].values.length; i++) {
      const rid = regRows[0].values[i][0] as number
      const rname = regRows[0].values[i][1] as string
      db.run(
        'INSERT INTO region_accounts (region_id, account_name, balance) VALUES (?, ?, ?)',
        [rid, `${rname}财务账户`, 0]
      )
    }
    db.run(
      'INSERT INTO region_accounts (region_id, account_name, balance, is_master) VALUES (?, ?, ?, 1)',
      [0, '总管理账户', 0]
    )
    console.log('Accounts created for all regions')
  }

    console.log('Seed data inserted')
    db.run('COMMIT')
  } catch (err) {
    try { db.run('ROLLBACK') } catch { /* ROLLBACK 失败不影响原始异常 */ }
    throw err
  }
}
