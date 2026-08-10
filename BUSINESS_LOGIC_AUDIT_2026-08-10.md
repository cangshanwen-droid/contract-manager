# Gipfel 业务逻辑审计报告（首轮·业务规则）

> 审计日期: 2026-08-10 | 项目: contract-manager | 范围: 金额计算/资金流水/模拟公式/交易撮合/上市/审计/通知/版本/格式化
> 结论概览: **P0 × 4 / P1 × 10 / P2 × 14**（其中 P0-1 为 v1.2.1 最新提交引入的回归，另 3 个为历史遗留）

---

## P0（算错钱 / 数据错误 / 功能全灭）

### P0-1 云端地址被改成单引号字面量 `'${CLOUD_API_BASE}'`，所有云端链路（含股票行情/交易/同步）全灭
- **位置**: `src/main/stock-sync.ts:19`、`src/main/ipc/stock-quote.handler.ts:6`、`src/main/ipc/stock.handler.ts:44`、`src/main/ipc/system.handler.ts:20`、`src/renderer/src/api/cloudApi.ts:11,96`、`src/renderer/src/pages/StockMarketPage.tsx:29`
- **引入**: commit `14a27fd` (v1.2.1「云端地址单点配置」) 把 `'https://106.54.26.86'` 机械替换成了 `'${CLOUD_API_BASE}'` —— 单引号不是模板串，`CLOUD_API_BASE` 导入后从未被使用，运行时 URL 就是字面量 `${CLOUD_API_BASE}/...`，`fetch()` 解析失败直接抛 TypeError。
- **影响场景**: ① 股票行情/行情页永远拿不到数据 → 交易功能全灭；② 公式计算后的 `syncStockPrices` PATCH 必然失败（stock-sync.log 全 ✗）；③ `isCloudMode()` 默认返回 `true`（cloudApi.ts:19-26），所有数据页默认走云端 → 应用开箱即坏；④ 设置页健康检查、公司上市建股、监控页账户/持仓全部失败。
- **修复**: 全部改为模板串 `` `${CLOUD_API_BASE}` ``（或直接引用导入的常量），并加一条不 mock `net.fetch` 的集成测试防回归。

### P0-2 合同类型 ID 与表单模板错位（8 型中 6 型表单给错字段，核心指标全错）
- **位置**: `src/renderer/src/pages/ContractListPage.tsx:587-644`（FIELD_SETS）与 `:429-456`（addItem switch） vs `src/main/database/seed.ts:80-89`（contract_types 顺序）vs `src/main/database/repositories/contract.repo.ts:308-339`（summarizeByRegion 按 ID 聚合）
- **映射对照**（UI 表单 / DB 实际类型 / 后端聚合语义）：
  | DB id | DB 类型 | UI 显示的表单 | 后果 |
  |---|---|---|---|
  | 1 | 基建 | 基建 ✅ | 正常 |
  | 2 | 开采 | **劳动力**（技能等级） | 碳排系数永远不填 → `carbon_factor || 1.0`（contract.repo.ts:318）→ 碳排按数量×1.0 虚高 |
  | 3 | 采购 | **开采**（碳排系数） | 税率不填；供应值=数量×单价 尚可用 |
  | 4 | 劳动力 | **销售**（税率） | skill_level 永远 0 → `total_talent` 永不累计（contract.repo.ts:314），人才/就业模型失效 |
  | 5 | 投资 | **采购** | 投资总额/预期收益无从填写 |
  | 6 | 拨款 | **投资** | 用户填的投资总额/预期收益 → 存入 item 级被丢弃（见 P0-3） |
  | 7 | 销售 | **拨款**（拨款金额） | 用户填"拨款金额"进 total_cost 字段 → 销售均价/收入失真；税率恒 0 |
  | 8 | 减碳 | 减碳 ✅ | 正常 |
- **修复**: FIELD_SETS 与 addItem 按 DB `contract_types.id` 重排；后端 summarize 改为按类型名匹配或与 UI 共用一份映射常量（放 shared/）。

### P0-3 合同级 total_cost / expected_income 创建时静默丢弃 → 收入流水链路实际失效、拨款/投资金额丢钱
- **位置**: `src/main/database/repositories/contract.repo.ts:85-100`（contracts INSERT 无 total_cost/expected_income/progress）、`:103-118` 与 `:173-191`（contract_items INSERT 无 expected_income/total_cost）；前端 `ContractListPage.tsx:626-633`（投资总额/预期收益/拨款金额只存在于 item 级字段）
- **错误场景**: 新建拨款/投资合同，用户填写"拨款金额 500000"，保存后 `contracts.total_cost=0`、`expected_income=0`（无任何 UI 路径可再设置，编辑表单 `:209-222` 也不含这些字段）。随后：① 合同 active → 支出只扣 `Σ数量×单价`（见 P1-2），拨款金额从未入账；② 合同 completed → `result.expected_income > 0`（contract.handler.ts:270）恒为假 → **收入流水永远不产生**。
- **修复**: create/update 时写入合同级与 item 级 total_cost/expected_income；或后端在 active/completed 时按 `Σ item.amount`（含税口径统一）计算支出/收入，不依赖用户手填字段。

### P0-4 Excel 导入流水/合同不更新账户余额、不校验状态 → 账户余额与流水永久脱钩
- **位置**: `src/main/ipc/excel.handler.ts:166-189`（`INSERT OR IGNORE` 直写 account_transactions/contracts）
- **错误场景**: 导入含 `account_transactions` 的 Excel 后，`region_accounts.balance` 不变 → 余额与流水不一致；可导入 `status='active'` 的合同（绕过审批、无支出流水）；`contract_no` 冲突被 `OR IGNORE` 静默吞掉，用户以为导入成功。
- **修复**: 导入 account_transactions 后重算余额（或拒绝导入流水表）；合同导入强制走 CONTRACT_CREATE 语义（draft+无审批状态）。

---

## P1（金额不一致 / 逻辑缺陷）

### P1-1 税率先算口径错误：百分比当小数用，13% 变 1300%
- **位置**: `src/main/database/migrations.ts:86-87`：`tax_amount = ROUND(quantity*unit_price*tax_rate, 2)`、`total = quantity*unit_price*(1+tax_rate)`；UI 标签「税率(%)」占位符「如：13」（ContractListPage.tsx:614,621）
- **错误场景**: 用户填 13（表示 13%），生成列 `total = 单价×数量×(1+13) = 14 倍`。当前 UI 未直接展示这两列（仅 Excel 导出 `SELECT *` 带出，且报表/未来引用即错钱）；金额计算（P1-2）完全不处理税 → 税务口径全链路缺失且两套语义冲突。
- **修复**: 统一语义（存小数或存百分数二选一），生成列除以 100；支出/收入计算明确含税口径。

### P1-2 合同支出金额与合同展示金额不一致（无税、忽略合同级 total_cost）
- **位置**: `src/main/ipc/contract.handler.ts:264` `totalCost = Σ (quantity*unit_price)`
- **错误场景**: ① 用户手填的投资总额/拨款金额（若 P0-3 修复后）与扣除额无关；② tax_rate 未计入；③ 合同表 `total_cost` 可经 update 白名单（contract.repo.ts:12）手工改大，但支出永远按明细算 → 账实不符。
- **修复**: 支出取 `contracts.total_cost`（创建/更新时由明细含税合计回填），或明确只按明细不含税并前端展示同口径。

### P1-3 区域账户余额可为负；手工流水金额无正数/上限校验
- **位置**: `src/main/ipc/contract.handler.ts:129-132`（`balance = balance - ?` 无余额检查）；`src/main/ipc/account.handler.ts:63-70`（INSERT 流水）+ `:76-90`（`balance + sign*amount`，amount 可负/0）
- **错误场景**: 余额 100 时扣 1000 → -900；手动录入 `trans_type='income', amount=-500` → 余额减少（充负漏洞）；`amount=0` 刷审计/通知。
- **修复**: expense 前校验 `balance >= amount`（事务内 SELECT 余额）；amount 必须 > 0；负余额场景（如允许透支）需显式业务规则。

### P1-4 模拟公式：成交价可为负（供远大于求 × 小人口）
- **位置**: `src/main/ipc/formula.handler.ts:44-47`：`sell_price = base_price*(1+H/100)*(1+(market_demand-supply)/max(qd_max,1))`，`qd_max = population*2`
- **错误场景**: 人口 1000、供应 10000（开采合同堆积）、需求 0 → 因子 `1+(0-10000)/2000 = -4` → 成交价为负，写入 formula_logs 并展示 `¥-xxx`。
- **修复**: 对供需因子做 `max(0, …)` 或 `clamp(1+(Qd-Qs)/max(2P,1), 0, 2)`；sell_price 最终 `max(0, …)`。

### P1-5 模拟公式：下期人口可为负（负增长率输入）
- **位置**: `src/main/ipc/formula.handler.ts:69-71`：`next_population = min(pop + pop*g*(H/100) + Δ, capacity)`，无下限
- **错误场景**: 增长率填 -0.1、幸福度 10 → 人口每轮缩 1%，迭代后可为负 → 区域 population 存负数 → 后续轮次 talentRatio/carbonPerCapita 失真。另 `Math.min(…, population_capacity)` 若 capacity 为 NULL（区域编辑清空）→ NaN → 人口写 NULL。
- **修复**: `next_population = max(0, min(pop+Δ, capacity))`；capacity 用 `Math.max(1, …)`。

### P1-6 后端状态机不强制：status 可任意跳转/任意值，绕过"active 先支出、completed 后收入"
- **位置**: `src/main/ipc/contract.handler.ts:229-231`（仅校验"已审批"，不校验 status 枚举与流转顺序）；类型定义 `ContractStatus`（types.ts:3）但 handler 未做运行时校验
- **错误场景**: 直接调 `CONTRACT_UPDATE {status:'completed'}`（渲染进程被改/未来前端改动）→ 未登记支出直接记收入；`{status:'done'}` 任意字符串落库 → 列表/状态标签异常。
- **修复**: 后端定义状态机 `draft→active→completed|terminated`，非法流转/非法枚举直接拒绝。

### P1-7 公司上市：云端建股失败不回滚本地 `is_listed`，股票代码无唯一性校验
- **位置**: `src/renderer/src/pages/CompanyListPage.tsx:106-119`（本地先写、云端 createStock 失败仅 warning）；`src/main/database/repositories/company.repo.ts:27-49`（create 无 symbol 唯一性检查）、`:44`（初始价直接存用户输入，可 0/负）
- **错误场景**: 本地 `is_listed=1` 保存成功 → 云端 500 → 公司显示"已上市"但云端无该股票 → 公式股价同步 PATCH 落空、监控页对不上；两家公司可同 symbol。
- **修复**: 先云端建股成功再写本地（或失败回滚 `is_listed`/`stock_symbol`）；本地加 `UNIQUE(stock_symbol)` + 价格 >0 校验。

### P1-8 基建计算器：`effectiveCarbonReduction = Math.max(2000, total)` 方向错误，凭空送 2000 吨减排
- **位置**: `src/main/ipc/infra-calc.handler.ts:97-100`
- **错误场景**: 区域无任何产业配套基建（totalCarbonReduction=0）→ effective=2000 → `net = max(0, baseline-2000)`，人口 100（基线 1000）时净排放直接归零；"下限"应作用于净排放（`max(0, …)`），而非抵扣额下限。
- **修复**: `effectiveCarbonReduction = Math.max(0, totalCarbonReduction)`；如需"最低抵扣"改为明确业务规则（如保底抵扣有成本）。

### P1-9 收入/支出可能落在不同账户（多账户区域）
- **位置**: 支出 `contract.handler.ts:99-102`（无账户时自动创建主账户后 LIMIT 1），收入 `:277-280`（LIMIT 1 任意账户）
- **错误场景**: 区域已有 2 个账户时，支出可能进主账户、收入进第一个（非主）账户，账目混乱；收入侧不会自动建账户（支出侧会），两路径不对称。
- **修复**: 统一按 `is_master=1` 定位主账户，缺失则创建，收入/支出同账户。

### P1-10 审计 old_value/new_value 不对称
- **位置**: `src/main/ipc/contract.handler.ts:219-225`（old_value 只含 5 个字段）vs `:251-255`（new_value 含全部变更字段）
- **影响**: 金额/进度变更（total_cost/expected_income/progress）在 old 侧缺失，审计比对不完整。
- **修复**: old_value 改用与 new_value 相同的 `pickChanges` 前快照。

---

## P2（一致性/体验/防御性问题）

1. **审计日志覆盖缺口（审计点6）**：`company.handler.ts`（CRUD 全无）、`region.handler.ts`（CRUD 全无，且无权限校验）、`announcement.handler.ts:28-82`（create/delete 无）、`excel.handler.ts:113-203`（导入直写库无）、`formula.handler.ts:55-95`（regions 被改写无）、`stock.handler.ts:16-26`（token 配置无）。读操作不审计 ✅ 正确。
2. **通知金额无千分位**：`notification.repo.ts:167` `¥${Number(amount).toFixed(2)}` vs 页面 `formatMoneyCNY`（`format.ts:30-34`）→ 通知里 1000000 显示 `¥1000000.00`，页面 `¥1,000,000`。
3. **幸福度刻度标定异常**：`formula.handler.ts:37-38` `clamp(happiness*10,1,100)`，常态（cs≈1, 人口 5 万）仅 ~10/100，UI 按 /100 展示（CalculatePage.tsx:105）；供≫求时又瞬间打满 100 → 刻度两端失真，且影响 sell_price 加成幅度。
4. **就业率无上界**：`formula.handler.ts:59-63` `5*log10(pop+100)+25B/(B+30)`，人口 10^18 时可 >100%；`output_employment_rate` 存库无约束。
5. **公式只更新 population/happiness/employment，不更新 talent_population/carbon_emissions**：`formula.handler.ts:85-91` → 多轮模拟中人才/碳排输入陈旧，需手动重导。
6. **版本历史幽灵版本**：`contract.handler.ts:234-236` saveVersionSnapshot 与 `:238` repo.update 不在同一事务 → update 抛错时产生无对应变更的快照。
7. **明细变更恒判定**：`contract.handler.ts:77-80` items 用 `JSON.stringify` 全量比较（含 id/顺序）→ 内容未变也记"items 变更"。
8. **快照不含 approval_status/approved_by/approved_at**：`contract.handler.ts:16-21` → 审批状态变化无法在版本快照中回溯（虽有 changed_fields 标签）。
9. **合同编号并发重复**：`contract.repo.ts:70-76` MAX+1 在事务外，并发创建 → UNIQUE 冲突直接失败，无重试。
10. **`ACCOUNT_SUMMARY.region_count` 语义错误**：`account.handler.ts:154` 统计"非主账户数"而非区域数（多账户区域时显示虚高）。
11. **`infra-calc` 注释与代码不符**：`infra-calc.handler.ts:57-60` 注释"已激活=一半"，实际 `activatedQty = currentQty` 全部 → 使用费/减排按全量算。
12. **导入列名黑名单式过滤**：`excel.handler.ts:158-160` autoColumns 列表不全（如 `contract_items.expected_income/total_cost` 可被导入）→ 数据污染面。
13. **ACCOUNT_CREATE 允许负初始余额**：`account.handler.ts:34-39` 无校验。
14. **公式 handler 返回类型欺骗**：`formula.handler.ts:101-105` catch 分支 `return { success:false, message } as any` 混入 `FormulaOutput` 类型 → 前端 `result.happiness` 可能为 undefined 显示 `-/100`。

---

## 附：本次未发现问题的审计点
- **重复触发防护（支出/收入）**：`hasContractTransaction`（contract.handler.ts:144-150）按 (contract_id, trans_type, category, source_type='contract') 幂等，active→completed→active 反复流转不会重复入账 ✅
- **通知越权**：markRead 绑定 user_id（notification.repo.ts:57-63），读取基于主进程会话 ✅
- **读操作不审计** ✅
- **交易撮合本体**（下单价格校验/余额扣除/持仓结算/卖空防护）位于云端 stock-api（`gipfel.ltd`/外部服务），本仓库无实现；本地侧仅行情读取、token 配置、上市建股、公式→股价同步——其中云端链路已被 P0-1 全灭。
