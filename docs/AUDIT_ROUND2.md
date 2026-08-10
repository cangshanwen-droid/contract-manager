# 架构与代码质量审计（第二轮）— Gipfel contract-manager v1.2.1

审计时间：2026-08-10 · 基线：`14a27fd` · vitest 51/51 通过 · `tsc --noEmit` 0 错误
审计范围：src/main（IPC/数据库）、src/preload、src/renderer（页面/组件/API 层）、src/shared、tests/

---

## 🔴 P0 — 必须立即修复

### P0-1. 云端地址「单点配置」重构引入字面量回归：`${CLOUD_API_BASE}` 未插值
`feat(v1.2.1): 云端地址单点配置cloud-config`（14a27fd）把硬编码 IP 改为 `'${CLOUD_API_BASE}'` 时**用了单引号**，7 处全部成为字面量字符串：

| 文件:行 | 内容 |
|---|---|
| src/renderer/src/api/cloudApi.ts:11 | `const API_BASE = '${CLOUD_API_BASE}'` |
| src/renderer/src/api/cloudApi.ts:96 | `CLOUD_ARENA_URL = '${CLOUD_API_BASE}'` |
| src/renderer/src/pages/StockMarketPage.tsx:29 | `CLOUD_ARENA_URL = '${CLOUD_API_BASE}/'` |
| src/main/ipc/stock-quote.handler.ts:6 | `STOCK_API = '${CLOUD_API_BASE}'` |
| src/main/ipc/stock.handler.ts:44 | `net.fetch('${CLOUD_API_BASE}/market/stocks')` |
| src/main/ipc/system.handler.ts:20 | `API_BASE = '${CLOUD_API_BASE}'` |
| src/main/stock-sync.ts:19 | `STOCK_API = '${CLOUD_API_BASE}'` |

证据：
- 构建产物 `out/main/index.js:1450/3671`、`out/renderer/assets/index-*.js:72912` 中字面量原样存在，无构建期替换。
- 各文件 `import { CLOUD_API_BASE }` 后**从未使用**该变量（`tsc` 未报错因未开 `noUnusedLocals`）→ 重构意图是插值，实际写成了字面量。

影响（云端模式**默认开启** `isCloudMode()` 返回 true）：
- 渲染层 fetch 相对 URL（file:// 或 dev origin）→ 全部失败/404；
- 主进程 `electron.net.fetch` 相对地址 → 抛错；
- 所有数据页在云模式下**静默空白**（详见 P1-3，多数页面 load() 无 catch 连错误提示都没有）。
- 修复：7 处改模板字符串/直接用 `CLOUD_API_BASE` 变量 + 删除未用 import；补一条单测断言 `CLOUD_API_BASE` 为 `https://` 开头（防字面量回归）。

---

## 🟠 P1 — 本轮应修

### P1-1. IPC 通道双源漂移：ROUTE_MAP 与 IPC_CHANNELS 不一致
`src/shared/constants.ts` IPC_CHANNELS 共 **75** 个通道；`cloudApi.ts` ROUTE_MAP 仅 **55** 条，且为独立手写枚举，无编译期约束。

- **26 个本地通道无云端映射** → 云端模式下 `invoke()` 静默降级本地 IPC（`isCloudMode() && ROUTE_MAP[channel]` 不成立时走 `window.api.invoke`）。危险项：
  - `contract:approve` / `contract:batch-approve` — 云端模式（默认）下审批写入**本地 SQLite**，与云端数据分叉；多用户共享场景下审批不可见。
  - `notification:*`、`dashboard:system-stats`、`auth:logout`、`auth:reset-password`、`audit:log`、`credential:*`、`db:restore`、`db:backup-to-desktop`、`file:*`、`stock:set-token` 等。
- **6 个通道仅在 ROUTE_MAP**（`stock:place-order/cancel-order/get-orders/get-positions/get-accounts/account-summary`），不在 IPC_CHANNELS 常量中 → "单点配置"名不副实，本地 IPC 也不存在这些 handler（云端专用，需确认是否有意）。
- 治理建议：① ROUTE_MAP 的 key 类型改为 `keyof typeof IPC_CHANNELS` 派生（共享 types 中用字符串字面量联合），编译期防漂移；② 云端模式对无映射通道**显式抛错**而非静默降级（或页面提示"该功能云端模式不可用"）；③ 缺失映射逐个补齐或声明不支持。

### P1-2. preload 暴露无白名单的原始 invoke/on
`src/preload/index.ts` 直接把 `ipcRenderer.invoke(channel, ...args)` 透出，**任意通道可调**（credential:get、db:backup、excel:export 等）。主进程各 handler 有 requirePermission 兜底（缓解），但缺少纵深防御：一旦渲染层被 XSS/依赖注入攻破，可调用所有通道。建议：preload 内做通道 allowlist（按前缀/枚举过滤），`on` 同理（事件订阅也应按通道名白名单）。

### P1-3. 渲染层异步错误处理不一致：无 catch 的 load() 静默失败/无限转圈
- `ContractListPage.tsx:128` `Promise.all` + `try/finally` **无 catch** → 任一请求失败：loading 关闭、表格空白、无任何错误提示（P0-1 修复前即表现为"全站空白页"）。
- `RegionListPage.tsx:23` load() **无 try/catch** → reject 未处理 + `setLoading(false)` 永不执行 → **无限转圈**。
- 8 处 `.then()` 无 catch（AccountPage:57、AnnouncementPage:42、CalculatePage:19、InfraCalculator:63、InfrastructureListPage:14、LandAreaReport:21、StockMarketPage:159、TrendsPage:26）；45 处 invoke 无显式 catch。
- 无全局 `unhandledrejection` 处理（main 有 console 兜底，renderer 无）。
- 建议：统一抽 `useAsyncData(fetcher)` + 三态（Spin/Empty/Result）组件；页面级 catch 显示 `message.error` + 重试按钮；main.tsx 挂全局 unhandledrejection 提示。

### P1-4. region/company 仓库 update 无字段白名单（与 contract.repo 不一致）
- `region.repo.ts:33`、`company.repo.ts:45`：`Object.keys(data)` 全放行拼 `SET ${k} = ?`（值已参数化，无注入，但任意列可写）。contract.repo 已有 P0-2 白名单（UPDATE_ALLOWED_FIELDS），三个仓库标准不一。建议统一白名单模式（业务列枚举 + 拒绝审批/审计列）。

### P1-5. ContractListPage.tsx 1177 行巨型组件
单文件承载：列表+筛选+新建/编辑表单+明细行编辑器+详情抽屉+版本历史+审批弹窗+批量操作栏，≥20 个 useState。建议按功能拆子组件（ContractTable / ContractForm / ContractDetail / VersionHistory / ApprovalModal / BatchBar）+ 提取 `useContractList` hook。DashboardPage（841 行）次之，其中 6 个 `useState<any>`。

### P1-6. API 层双轨：typed wrappers 与 untyped `api` 大对象并存
`dashboard.api.ts` 内导出 `api`（region/company/contract/contractType，全 `any`，且与命名不符——dashboard.api 却含 region/company API）；同时存在 typed `regionApi`（region.api.ts）、`companyApi`（company.api.ts）、`dashboardApi`/`formulaApi`。7 个页面用 untyped `api`，4 个用 typed wrapper，端点重复定义。建议：删除 `api` 大对象，统一 typed `contract.api.ts` 等；`invoke` 返回类型去掉 `Promise<any>`（错误形状 `{success:false}` 与数据形状并用 discriminated union 表达）。

### P1-7. 审计归属字段信任渲染进程：`(data as any)._operatorRole / created_by / updated_by`
account.handler:147、contract.handler:178-246 等从渲染进程 payload 读取 `_operatorRole`、`created_by` 写入审计日志/快照。权限判定已走主进程 session（好），但**审计归属可被伪造**（如 rep 提交操作但 `_operatorRole:'admin'`）。建议：审计 operator/role 一律取 `getSessionUser()`，渲染进程字段作废或仅作显示名。

---

## 🟡 P2 — 技术债/下轮

1. **三态/数据加载抽取**：`useRegions` hook 已写但仅 1 处使用（多数页面仍手写 `api.region.list().then(...)`）→ 全量采用或删除；`const load = async` 样板在 ≥6 页面重复；AccountMonitorPage 4 组独立 loading 标志。
2. **快捷键 useEffect 重复**：Escape/Enter/Ctrl+N 在 RegionListPage/ContractListPage/UserManagementPage/AppLayout 复制 → 抽 `useEscapeClose`/`useGlobalShortcut`。
3. **contract.handler 资金登记重复**：income 登记（270-296）与 syncContractCostToAccount（89-135）逻辑同构内联两份 → 合并为 `registerTransaction(contractId, type, amount, desc)` 带幂等。
4. **迁移原子性**：runMigrations 无整体 BEGIN/COMMIT（当前靠 executeMulti 列存在性检查 + 失败版本不写库实现可重跑，风险低）；可考虑整体事务包裹。
5. **魔法数字**：contract.repo.summarizeByRegion 中 contract_type_id 1/2/3/4/7 无命名常量。
6. **cloudInvoke body 约定脆弱**：POST/PUT 取"最后一个对象参数"作 body，auth:login（2 个字符串参数）会发空 body；建议改为显式 `(channel, params)` 单参数契约。
7. **响应形状统一**：部分 handler 返回裸数组（contract:list）、部分 `{success}`、部分 `{success, data}`；页面各自适配 → 建议统一 `{success, data?, message?}` 包装（对 ROUTE_MAP 云端通道也一致）。
8. **登录页预登录枚举**：AUTH_LIST_USERS 未登录时放行（用于首启检测），会暴露用户列表（id/username/role）→ 改专用 `auth:first-use` 通道。
9. **假 token 设计**：LoginPage `setAuthToken(JSON.stringify({u,t}))` 本地伪造 token，cloudLogin 成功才覆盖为真 JWT；云模式认证应由主进程 session 主导，token 生命周期梳理。
10. **落盘 .bak 策略**：每次写盘全量 copyFileSync 到 .bak（DB 仅 ~136KB，代价小）；可考虑按时间节流。

---

## ✅ 已确认的强项（不回归）

- **SQL 注入面已封堵**：queryAll/queryOne/execute 全部 prepare+bind；excel 导入导出表名/列名双白名单（TABLE_LABELS + PRAGMA table_info）；audit where 固定 AND 子句；contract/company/region 的 SET 字段名有界。无残留拼接注入点。
- **contract.repo P0-2 白名单生效**：create 硬编码列 + 固定 draft/none；update 白名单过滤 approval 字段；transitionApproval 状态机完整（submit/approve/reject 前置校验）。
- **审批/批量操作**：逐条事务 + 失败回滚 + 明细返回；权限点后端校验（requirePermission 基于主进程 session）。
- **迁移幂等机制**：schema_migrations 版本表 + executeMulti ALTER 列存在性跳过 + 失败版本不记录可重跑。
- **单实例锁 + 原子落盘**：requestSingleInstanceLock；tmp+rename 原子写 + .bak。
- **类型纪律**：0 @ts-ignore、0 非空断言、`as unknown as` 仅 2 处；tsc --noEmit 通过。
- **错误处理（main 侧）**：所有 IPC handler 均 try/catch 统一 `{success:false,message}`。
- **认证安全**：bcrypt + 登录限流；AUTH_LIST_USERS 不返回 password；凭据 safeStorage 加密。

---

## 🧪 测试覆盖分析（51 例全绿）

| 领域 | 覆盖 | 缺口 |
|---|---|---|
| 审批状态机 | ✅ 单级全路径 + update 白名单防伪造（11） | 多级审批链回滚未测 |
| 批量操作 | ✅ submit/approve/delete + 权限 + 审计（8） | — |
| 权限矩阵 | ✅ 静态映射 + DB 解析 + 会话守卫（13） | handler 级权限映射逐一断言缺失（仅 batch 测了 IPC 层） |
| 格式化 | ✅ 金额/日期/百分比/趋势（14） | — |
| 股票同步 | ✅ 区域映射（5） | — |
| **金额/业务计算** | ❌ 未测 | summarizeByRegion 汇总（人口/碳/供给/均价）、CONTRACT_UPDATE totalCost 与 expense/income 入账、syncContractCostToAccount 幂等、formula.handler calculateFormulas 核心模拟公式 |
| **迁移幂等** | ❌ 未测 | runMigrations 重跑、executeMulti ALTER 跳过 |
| **落盘/事务** | ❌ 未测 | connection.ts notifyWrite/txnDepth/原子落盘 |
| **云模式/ROUTE_MAP** | ❌ 未测 | P0-1 字面量若被单测锁定必然被抓；cloudInvoke 模式切换、ROUTE_MAP 漂移 |
| 组件层 | ❌ 0 组件测试（无 @testing-library） | 三态、RoleGuard 渲染、表单校验 |

建议补测优先级：公式/金额计算（含幂等）> 迁移幂等 > ROUTE_MAP 一致性（编译期校验替代）> connection 落盘。

---

## 🏗️ 架构改进建议（不直接改代码）

1. **通道契约单一化**：`IPC_CHANNELS` 为唯一事实源，`ROUTE_MAP` 由它派生（`Record<keyof typeof IPC_CHANNELS, ...>`），云端映射缺失/多余编译期报错；`contract:approve` 等核心通道补云端映射或显式禁用。
2. **renderer API 层收敛**：typed wrapper 统一（region/company/contract/formula/account/announcement...），删除 untyped `api` 大对象；`invoke` 返回 `Promise<ApiResult<T>>` discriminated union。
3. **错误处理规范化**：`useAsyncData` + 三态组件 + 全局 rejection 兜底；错误响应统一 `{success:false, code, message}`（云端 REST 错误已含 status 映射）。
4. **页面组件化拆分**：ContractListPage（1177 行）为第一目标，其次 DashboardPage（841 行）。
5. **审计链路可信化**：main 侧 session 为审计归属唯一来源。
6. **安全纵深**：preload 通道白名单 + 移除/收紧 `AUTH_LIST_USERS` 预登录放行。
