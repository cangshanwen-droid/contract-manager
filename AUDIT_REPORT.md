# Gipfel 后端审计报告：公式引擎 · 数据库 · 硬编码数据

> 审计日期: 2026-08-08  
> 项目: contract-manager (Electron桌面应用 — 基础设施合同管理 + 区域商业模拟)  
> 备项目: gipfel-saas (Next.js前端移植项目, 同数据模型)

---

## 1. 架构概览

```
src/main/
├── index.ts                    # Electron 主进程入口
├── database/
│   ├── connection.ts           # SQL.js 内存数据库连接 (debounced 2s 写入)
│   ├── helpers.ts              # queryAll/queryOne/execute/executeMulti/lastInsertId
│   ├── migrations.ts           # 6 轮 migration (v1-v6)
│   ├── seed.ts                 # 种子数据 (32种基建类型 + 示例区域/公司/合同)
│   └── repositories/
│       ├── contract.repo.ts    # 合同CRUD + summarizeByRegion (关键!)
│       ├── region.repo.ts      # 区域CRUD
│       ├── company.repo.ts     # 公司CRUD (软删除)
│       ├── dashboard.repo.ts   # 仪表盘聚合查询
│       └── contract-type.repo.ts # 合同类型CRUD
└── ipc/
    ├── register-all.ts         # 注册 13 个 handler 模块
    ├── formula.handler.ts      # ★ 公式引擎核心
    ├── infra-calc.handler.ts   # ★ 基建计算器
    ├── contract.handler.ts     # 合同 IPC
    ├── region.handler.ts       # 区域 IPC
    ├── company.handler.ts      # 公司 IPC
    ├── account.handler.ts      # 财务账户+交易流水
    ├── auth.handler.ts         # PBKDF2认证 + 登录限流
    ├── dashboard.handler.ts    # 仪表盘
    ├── report.handler.ts       # 占地面积报表
    ├── excel.handler.ts        # Excel导入导出
    ├── backup.handler.ts       # 数据库备份
    └── gipfel.handler.ts       # Gipfel外链窗口 (打开 gipfel.ltd)
```

---

## 2. 公式引擎分析

### 位置: `src/main/ipc/formula.handler.ts` (lines 7-87)

### 引擎架构
- **单一函数**: `calculateFormulas(input: FormulaInput): FormulaOutput` 
- **无DSL/解析器**: 公式硬编码在 TypeScript 函数体内
- **无模块化**: 所有公式在一个函数中，不可单独调用或组合

### 已实现公式 (9个)

| # | 公式 | 表达式 | 输入 | 输出域 |
|---|------|--------|------|--------|
| F1 | 消费者满足度 | `c = Qs / Qd` | supply_quantity, demand_quantity | [0, ∞) |
| F2 | 价格敏感系数 | `β = 1 - P_prev / P_current` | prev_avg_price, current_avg_price | (-∞, 1] |
| F3 | 市场需求量 | `Qd = β × P` | price_sensitivity, population | (-∞, population] |
| F4 | 幸福度(原始) | `H_raw = 0.6c + 0.1·log10(P+100) + 2·R_talent + 0.2·C_pc` | consumer_satisfaction, population, talentRatio, carbonPerCapita | - |
| F5 | 钳制幸福度 | `H = clamp(H_raw × 10, 1, 100)` | F4输出 | [1, 100] |
| F6 | 基准价格 | `P_base = cost + profit` | base_cost, base_profit | [0, ∞) |
| F7 | 商品成交价 | `P_sell = P_base × (1+H/100) × (1+(Qd-Qs)/max(2P,1))` | base_price, happiness, market_demand, supply_quantity | [0, ∞) |
| F8 | 就业率 | `E = 5·log10(P+100) + 25·B/(B+30)` | population, infra_employment_bonus_total | [0, ∞) |
| F9 | 人口迭代 | `P_next = P + (P·g·(H/100) + ΔP_infra) × max(0, 1-P/C)` | population, base_growth_rate, happiness, infra_population_delta, capacity | [0, capacity] |

### 缺失/应补充的公式

| # | 缺失公式 | 严重度 | 说明 |
|---|---------|--------|------|
| M1 | **碳排放对幸福度的倒数非线性** | 高 | F4中 `+0.2 * carbonPerCapita` 是正权重！碳排放越高幸福度越高 — 与设计意图（碳排应降低幸福度）矛盾。应为 `- 0.2 * carbonPerCapita` 或使用对数衰减 |
| M2 | **税收计算** | 中 | contract_items 有 tax_rate 字段但公式引擎未使用；税额仅通过 SQL GENERATED 列计算 |
| M3 | **劳动力技能等级对生产率影响** | 中 | contract_items 有 skill_level 字段，仅用于人才判断(>=0.5)，未在公式中体现 |
| M4 | **基建h_bonus对幸福度加成** | 中 | InfrastructureType 有 h_bonus 字段但公式引擎未接收/使用 |
| M5 | **碳交易/碳配额定价公式** | 中 | 有减碳合同类型但无碳定价公式 |
| M6 | **财政拨款利率/通胀模型** | 低 | 拨款合同类型存在但无相关经济模型 |
| M7 | **多轮累积效应** | 低 | 每轮独立计算，缺乏跨轮状态累积（如环境污染累积） |

---

## 3. 硬编码数据分析

### 3.1 种子数据 — `src/main/database/seed.ts`

| 数据类 | 条目数 | 性质 |
|--------|--------|------|
| **基建类型** (infrastructure_types) | **32种** | ★完全硬编码在 `seed.ts` arrays中 (lines 7-46) |
| 其中: 民生配套类 | 22种 | 邮局/停车场/公交站/公园/学校/医院等 |
| 其中: 产业配套类 | 10种 | 分类垃圾桶/节能路灯/污水处理/碳捕集等 |
| 就业率加成 (infra_employment_bonuses) | 32条 | 从基建类型同步，数据源相同 |
| 合同类型 (contract_types) | 8种 | 基建/开采/采购/劳动力/投资/拨款/销售/减碳 |
| 示例区域 (regions) | 3个 | A区(5万)/B区(3万)/C区(2万) — 固定初始值 |
| 示例公司 (companies) | 4家 | 建设集团/市政/设计院/设备供应 |
| 示例基建合同 | 3个×多条明细 | 每个区域一份，含固定基建项目+数量 |

### 3.2 硬编码常量 — `src/shared/constants.ts`

| 常量 | 值 | 位置 |
|------|-----|------|
| `DEFAULT_PAGE_SIZE` | 20 | constants.ts:64 |
| `CONTRACT_STATUS_OPTIONS` | 5种状态 | constants.ts:56-62 |

### 3.3 代码逻辑中的硬编码

| 位置 | 硬编码内容 |
|------|-----------|
| `seed.ts:57` | `maintenance_fee = price * 0.02` (维护费固定为价格的2%) |
| `infra-calc.handler.ts:37` | `baselineCarbon = population * 10` (人均碳排固定10吨) |
| `infra-calc.handler.ts:60` | `activatedQty = category === '产业配套' ? currentQty : 0` (简化假设) |
| `infra-calc.handler.ts:98` | `effectiveCarbonReduction = Math.max(2000, totalCarbonReduction)` (碳排抵扣下限2000) |
| `contract.repo.ts:241` | `infra_population_delta = land_area * quantity * 0.1` (每平米土建贡献0.1人) |
| `auth.handler.ts:8-10` | `PBKDF2_ITERATIONS=100000, KEYLEN=64` (密码学参数) |
| `index.ts:15` | `autoBackupInterval = 30 * 60 * 1000` (30分钟自动备份) |
| `formula.handler.ts:41` | `Math.log10(population + 100)` — 偏移量100为经验值 |
| `formula.handler.ts:63` | `25 * B / (B + 30)` — 就业率非线性系数25/30为经验值 |

### 3.4 版本号硬编码

| 位置 | 内容 |
|------|------|
| `SettingsPage.tsx:79` | 版本号 `1.1.0` (未从 package.json 动态读取) |
| `SettingsPage.tsx:81` | `Gipfel 商业模拟 3.0` (版本声明) |

### 3.5 Dashboard bug: 引用不存在字段

`DashboardPage.tsx:100` 引用 `data.total_carbon` — 但 `DashboardSummary` 类型定义(values.ts:123-130)没有此字段。这会在运行时返回 `undefined`。

---

## 4. 数据库结构审计

### 4.1 表清单 (6轮migration, 共10张表)

| 表名 | Migration版本 | 状态 |
|------|--------------|------|
| `regions` | v1 | ✅ |
| `companies` | v1 | ✅ |
| `infrastructure_types` | v1 (v3/v4扩展) | ✅ |
| `contract_types` | v1 | ✅ |
| `contracts` | v1 | ✅ |
| `contract_items` | v1 (v2扩展) | ✅ |
| `formula_logs` | v1 | ✅ |
| `infra_employment_bonuses` | v1 | ✅ |
| `users` | v5 | ✅ |
| `region_accounts` | v6 | ✅ |
| `account_transactions` | v6 | ✅ |
| `schema_migrations` | migrations.ts:200-206 | ✅ |

### 4.2 字段完整性对比 (TypeScript types vs DB schema)

#### ✅ 完全匹配

| TypeScript Interface | 数据库表 | 一致性 |
|---------------------|---------|--------|
| `Region` | `regions` | ✅ |
| `Contract` | `contracts` | ✅ |
| `ContractItem` | `contract_items` | ✅ |
| `Company` | `companies` | ✅ |
| `InfrastructureType` | `infrastructure_types` | ✅ |
| `FormulaLog` | `formula_logs` | ✅ |

#### ❌ 字段缺失/不一致

| 问题 | 详情 |
|------|------|
| **Contract.contract_type_id 缺失** | TypeScript `Contract` 接口(line 19-33)没有 `contract_type_id` 字段，但DB和仓库代码使用它。在 `contract.repo.ts:57-60` 创建时用到。类型定义落后于实现。 |
| **ContractWithItems 缺少 contract_type_name** | repo返回的join字段 `contract_type_name` 未在类型中定义 |
| **DashboardSummary 缺少 total_carbon** | `DashboardPage.tsx:100` 引用了 `data.total_carbon` 但类型中无此字段；SQL查询也未返回 |
| **InfrastructureType 缺少 created_at** | TypeScript 接口无 `created_at` 字段 (但有实际插入) |
| **Users 表无 TypeScript 接口** | 用户的 TypeScript 类型未在 shared/types.ts 中定义 |
| **RegionAccount/AccountTransaction 无 TypeScript 接口** | 财务类表无对应的类型导出 |

### 4.3 数据库设计问题

| 问题 | 严重度 | 说明 |
|------|--------|------|
| `companies.region` 是 TEXT 不是 FOREIGN KEY | 中 | 应改为 `region_id INTEGER REFERENCES regions(id)` |
| `infrastructure_types` 数据完全硬编码 | 中 | 无法通过UI添加/编辑基建类型 |
| `infra_employment_bonuses` 表冗余 | 低 | 数据从 infrastructure_types name+bouns 同步，应该直接从 types 表 JOIN 查询 |
| 无外键级联删除保护 | 中 | 删除区域时不会自动清理关联的合同/账户数据 |
| SQL.js 内存数据库 | 低 | 数据完全在内存，断电风险。虽有debounced写入但非事务级持久化 |

### 4.4 索引完整度

| 索引 | 状态 |
|------|------|
| `idx_companies_region` | ✅ |
| `idx_contracts_region` | ✅ |
| `idx_contracts_status` | ✅ |
| `idx_contracts_party_b` | ✅ |
| `idx_contract_items_contract` | ✅ |
| `idx_formula_logs_region` | ✅ |
| `idx_trans_account` | ✅ |
| `idx_trans_fiscal` | ✅ |
| `contracts.contract_type_id` 无索引 | ⚠️ 建议添加 |
| `region_accounts.region_id` 无索引 | ⚠️ 建议添加 |

---

## 5. 数据流分析

### 5.1 真实计算路径

```
[用户输入合同] → ContractRepository.create()
    ↓
[合同数据存入SQLite] 
    ↓
[CalculatePage: "导入合同数据"] → ContractRepository.summarizeByRegion()
    ↓  按合同类型聚合: 劳动力=人口, 开采=碳排, 销售=供应/需求
    ↓
[CalculatePage: "运行模拟"] → formula.handler.calculateFormulas()
    ↓  9个公式依次计算
    ↓
[结果] → formula_logs表 + regions表(current_happiness/employment/population更新)
```

### 5.2 基建计算路径

```
[InfraCalculator 选择区域] → infra-calc.handler
    ↓  查询 infrastructure_types (硬编码32种)
    ↓  查询 contract_items (合同中已建数量)
    ↓  计算: suggested = population × ratio, gap = suggested - current
    ↓  计算: 年收益/维护费/建造成本/碳减排
    ↓
[用户点击"补建合同"] → 自动生成基建合同(contract_type_id=1)
```

### 5.3 计算质量评估

| 属性 | 评估 |
|------|------|
| 确定性 | ✅ 纯函数，无随机性 |
| 可复现性 | ✅ 相同输入→相同输出，日志完整保存 |
| 参数可调性 | ⚠️ 部分参数硬编码在代码中 |
| 经济模型合理性 | ⚠️ F4碳排权重符号错误（应为负） |
| 边界情况 | ⚠️ 有限除数保护但无溢出保护 |
| 单元测试 | ❌ 无测试文件 |

---

## 6. 总结与建议

### 6.1 关键问题 (P0)

1. **F4 碳排放权重符号错误** — `+ 0.2 * carbonPerCapita` 应改为 `- 0.2 * carbonPerCapita`（碳排越高幸福度越低才合理）
2. **DashboardPage 引用不存在字段 `total_carbon`** — 会导致运行时显示"0"或 undefined
3. **Contract 类型定义缺少 `contract_type_id`** — TypeScript 类型与实际查询不匹配

### 6.2 建议改进 (P1)

4. 将 `seed.ts` 中的32种基建类型数据迁移到外部JSON/YAML配置文件
5. 为公式引擎添加单元测试
6. 添加 `contract_type_id` 索引
7. `companies.region` 改为外键关联

### 6.3 架构建议 (P2)

8. 公式引擎从硬编码函数重构为配置驱动(DSL或JSON公式定义)
9. 添加缺失的经济模型：税收影响、碳定价、通货膨胀
10. 让基建类型可通过UI增删改（非硬编码种子）

### 6.4 硬编码数据统计

| 类别 | 数量 |
|------|------|
| 基建类型种子数据 | 32条 × 15个字段 |
| 经验常数（公式中） | 8处 |
| UI常量 | 3处 |
| 版本号 | 2处 |
| **合计** | ~500个硬编码值 |
