# Gipfel 性能审计报告（2026-08-10）

范围：启动/渲染/内存泄漏/云端延迟/崩溃恢复/打包体积/网络异常/SQL 性能
实测依据：源码走查 + 打包产物 `dist/win-unpacked` 体积分析 + 本地真实库 `%APPDATA%/Roaming/contract-manager/contract-manager.db` 实测（196KB / 3 合同）+ `EXPLAIN QUERY PLAN` + 迁移全流程计时（verify-local 1.1s）。

---

## P0（崩溃/数据/主路径不可用）

### P0-1 登录页 rAF 动画永不停止（内存+CPU 泄漏）
- **位置**：`src/renderer/src/pages/LoginPage.tsx:98-100`（`requestAnimationFrame(run)` 自续帧），cleanup `:105-108` 只移除 resize/motion 监听，**没有 cancelAnimationFrame**
- **影响**：登录成功后 LoginPage 卸载，但 rAF 链已调度、不会因卸载取消 → 60fps Canvas 循环永久空转，闭包持有已脱离 DOM 的 canvas/ctx，CPU 持续占用 + 内存泄漏（笔记本续航/发热），属于本仓库唯一一处未清理的定时器
- **修复**：加 `rafRef`，cleanup 里 `cancelAnimationFrame(rafRef.current)`；参照 GlobeView.tsx:212,226 的写法

### P0-2 云端请求全部无超时 + 轮询无 in-flight 守卫（默认云端模式=true 下断网即卡死/堆积）
- **位置**：`src/renderer/src/api/cloudApi.ts:75-89`（cloudFetch）、`:118-133`（fetchWithAdminKey）；主进程 `src/main/ipc/stock-quote.handler.ts:22-30`（fetchMarket）、`src/main/ipc/stock.handler.ts:44-50`（STOCK_TEST_CONNECTION）。全仓仅 `system.handler.ts:27` 用了 AbortController(5s)
- **影响**：云端不可达时（无网/服务器宕机，Chromium fetch 默认可挂 30s+）：
  1. Dashboard `DashboardPage.tsx:118-127` 的 `Promise.all` 4 个请求全部悬挂 → 首页一直 Skeleton；
  2. `DashboardPage.tsx:87` / `AccountMonitorPage.tsx:179` / `StockMarketPage.tsx:151` / `NotificationBell.tsx:70` 的 30s/15s 轮询无 in-flight 标志，慢请求未返回时下一 tick 再发 → 请求无限叠加，连接/内存堆积；
  3. rep 行情卡、账户监控 4 个接口全挂
- **修复**：cloudFetch/fetchWithAdminKey/fetchMarket 加 AbortController（建议 10s）+ 失败时 `quoteFailed` 类降级已有（Dashboard 做对了）；轮询函数加 `inFlight` 标志（`if (inFlight) return`），失败指数退避（30s→1m→5m）

### P0-3 主进程/渲染进程崩溃无任何恢复与日志
- **位置**：`src/main/index.ts` 全文件——无 `process.on('uncaughtException')`（仅有 console EPIPE 包装 :13-18）、无 `app.on('render-process-gone')`、无 `app.relaunch()`；渲染端仅有 React ErrorBoundary（`main.tsx:5`），接不住进程级崩溃
- **影响**：主进程异常 → 应用直接消失无提示（用户以为闪退）；渲染进程 OOM/GPU 崩 → 白屏窗口，需手动重启；无崩溃转储/日志可排查
- **修复**：`process.on('uncaughtException')` 记录并弹窗提示；`render-process-gone` → `webContents.reload()` 或 `app.relaunch()`（配合单实例锁）；建议引入文件日志（见 P2-5）

### P0-4 数据库文件损坏 → 启动即挂，无自动回退
- **位置**：`src/main/database/connection.ts:91-96` `initDatabase` 中 `new SQL.Database(buffer)` 无 try/catch——sql.js 对损坏文件直接抛异常，`index.ts:153` 的 `await initDatabase()` reject → 应用启动失败且无任何降级提示
- **影响**：磁盘损坏/断电半写（虽有 tmp+rename 原子落盘降低概率，但仍可能）后，用户打开应用直接失败；`contract-manager.db.bak`（每次写盘前保留）存在但**无自动回退逻辑**
- **修复**：initDatabase 包 try/catch，失败时依次尝试 `.bak` → `backups/` 最新自动备份 → 全新空库并提示用户；sql.js 可用 `db.checkIntegrity()` 校验

---

## P1（显著性能/体验问题）

### P1-1 云端全量列表无分页，Dashboard 拉全表只显示 6 条
- **位置**：`src/renderer/src/api/cloudApi.ts:152`（`contract:list → GET /api/contracts` 无 limit 参数）；云端 `gipfel-saas/backend/app/routes/contracts.py:37-58`（`list_contracts` 全表 + 3 个 LEFT JOIN 无分页）；`DashboardPage.tsx:118-127,255-257`（拉 CONTRACT_LIST 全量只为状态分布图 + 最近 6 条）
- **影响**：3Mbps（~375KB/s）下 1000 合同 ≈ 2MB+ JSON ≈ 5-8s；ContractListPage 每次进入也全量下载后客户端分页（`ContractListPage.tsx:811-815` pageSize 20 但 dataSource 是全量）；云库增长后每次列表/仪表盘请求都拖全表
- **修复**：`contract:list` 支持 `limit/offset`（或 `summary` 专用端点返回 GROUP BY status + 最近 N 条）；Dashboard 改用本地 `dashboard:summary` 扩展或云端专用统计接口；表格改服务端分页

### P1-2 账户监控 30s 全量轮询 ×4，无守卫无退避
- **位置**：`src/renderer/src/pages/AccountMonitorPage.tsx:174-186`（每 30s 并发 `loadAccounts`(admin/accounts) + `loadUsers`(AUTH_LIST_USERS) + `loadFunds`(ACCOUNT_LIST) + `loadContracts`(CONTRACT_LIST)，均为全量接口）
- **影响**：admin 挂着页面 = 持续 4 路全量传输；慢网下叠加（同 P0-2）；合同全量只为概览计数
- **修复**：加 in-flight 标志 + 失败退避；CONTRACT_LIST 换 COUNT 接口；页面不可见（document.hidden）时暂停轮询

### P1-3 云端 SQLite 并发写锁（多用户卖点下必现）
- **位置**：`gipfel-saas/backend/app/database.py:5-10`——SQLAlchemy engine 仅 `check_same_thread=False`，**无 WAL、无 busy_timeout**（SQLite 默认 journal=delete、busy_timeout=5s）；写路径 `routes/contracts.py:109 db.commit()` 等无重试
- **影响**：多用户并发写（云端模式核心场景）→ `sqlite3.OperationalError: database is locked` → 500；读多写少时也会因长写事务阻塞读
- **修复**：`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL`（engine connect 事件里执行）+ 写操作 2-3 次重试（退避）

### P1-4 每条写语句全量落盘 + 复制 .bak（主进程阻塞，DB 增长后放大）
- **位置**：`src/main/database/connection.ts:118-131`——事务外每条 INSERT/UPDATE/DELETE → `db.export()` 全量序列化 + writeFileSync(tmp) + **copyFileSync 旧库→.bak** + renameSync，全部同步在 Electron 主进程线程
- **影响**：当前 196KB 无感；但 audit_logs/notifications/account_transactions/contract_versions 随使用增长到 5-50MB 后，每次写操作 = 主进程阻塞 10-50ms（sql.js 单线程同步 + 2 次文件复制）；.bak 复制是纯冗余（tmp+rename 已原子保证不损坏，.bak 只是多一份历史，无需每次写都做）
- **修复**：.bak 限频（≤1 次/分钟或仅应用退出时）；批量写（Excel 导入、seed）包事务（executeMulti 目前无 BEGIN/COMMIT 包裹，见 P2-6）；DB 超阈值（如 5MB）后考虑降频落盘

---

## P2（优化项）

### P2-1 打包体积：asar=false + 全量 locales + sql.js debug 构建 + 大 base64
- **位置**：`electron-builder.yml:7`（`asar: false`）、未配 `electronLanguages`、未配 `compression`；`dist/win-unpacked` 实测 307MB / 安装包 86MB
- **构成**（实测）：locales 41MB（只需 en-US + zh-CN ≈ 2MB）；`resources/app` 39MB = sql.js dist 全量含 **debug 构建**（`sql-asm-debug.js` 5.4M + `worker.sql-asm-debug.js` 5.4M + sql-wasm-debug* ≈ 10.8MB 纯浪费，运行时只用 sql-wasm.js/wasm）+ xlsx 家族 5MB（含 codepage 2.1M）+ renderer bundle 4.6MB；Electron 本体 exe 181M/icudtl 10M/locales 为固定成本
- **修复**：① `asar: true`（`connection.ts:84-87` 的 locateFile 已兼容 .asar→.asar.unpacked，`asarUnpack` sql.js 已配置，可直接切换）② `electronLanguages: [en-US, zh-CN]` ③ files 排除 `node_modules/sql.js/dist/*debug*` ④ `compression: maximum`。预期：安装包 86MB → ~65-70MB，unpacked 307MB → ~250MB

### P2-2 渲染 bundle 4.63MB 单 chunk，无代码分割，内含 634KB base64 logo
- **位置**：`src/renderer/src/App.tsx:268-283`（14 个页面全部静态 import，无 React.lazy）；`src/renderer/src/components/LogoSystem.tsx:18`（`logo-full.txt?raw` 634KB base64 内联进 bundle）；`out/renderer/assets/index-*.js` 实测 4,628,294 字节
- **影响**：首屏解析 4.6MB JS（antd+recharts+dayjs+logo），冷启动渲染延迟；634KB logo 文本占 bundle 14%
- **修复**：路由级 `React.lazy` + `Suspense`；logo 走独立文件/小尺寸 PNG（技能既有教训：>800px 图片 OOM，634KB base64 同理宜瘦身）；`build.rollupOptions` 分包 vendor

### P2-3 合同列表排序缺索引（实测 TEMP B-TREE）
- **位置**：`src/main/database/migrations.ts:57-74`（contracts 表有 region/status/party_b/approval 索引，**无 created_at 索引**）；实测 `EXPLAIN QUERY PLAN`：`list()` 带 region_id 过滤时 `SEARCH c USING INDEX idx_contracts_region` + **`USE TEMP B-TREE FOR ORDER BY`**
- **影响**：1000+ 合同每页列表查询做全量临时排序；本地 sql.js 单线程主进程内执行，排序成本直接卡 IPC
- **修复**：加 migration `CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON contracts(created_at)`（注意：加 migration 需同步改 `scripts/verify/verify-local.js` 迁移计数 19→20，共 6 处）

### P2-4 STOCK_GET_QUOTE 每次都拉全市场再内存过滤
- **位置**：`src/main/ipc/stock-quote.handler.ts:38-43`
- **修复**：走云端 `/market/quotes/{symbol}`（ROUTE_MAP 已有 `stock:get-quote` 映射）；fetchMarket 结果缓存 5-10s 复用

### P2-5 无文件日志，EPIPE 包装吞错误
- **位置**：`src/main/index.ts:13-18`（console 包装 try/catch 静默）；全项目仅 console 输出
- **影响**：崩溃/异常无落盘日志可查（技能文档已记录"崩溃框消失≠问题解决"教训）
- **修复**：electron-log 或简单 `appendFile` 轮转日志（userData/logs/），保留 console 包装的 EPIPE 保护

### P2-6 迁移不在事务内，全新安装每条语句触发一次全量落盘
- **位置**：`src/main/database/helpers.ts:61-82` executeMulti 无 BEGIN/COMMIT 包裹 → `runMigrations()`（migrations.ts:402-418）每次 `db.run` 触发 notifyWrite 全量 flush；实测全新库 19 迁移 + seed 总耗时仅 1.1s（**当前不是瓶颈，仅首次安装多 ~80 次写盘**）
- **修复**：executeMulti 内包事务（注意 COMMIT 后统一落盘的既有机制）；低优先级

### P2-7 双路自动备份重复
- **位置**：`src/main/index.ts:23-52`（startAutoBackup 无条件 30min）+ `src/renderer/src/pages/SettingsPage.tsx:45`（渲染端 30min 轮询 DB_AUTO_BACKUP，开关开启时）→ 两套逻辑写同一 `backups/` 目录
- **修复**：二选一（保留主进程定时器，删除渲染端 interval）

### P2-8 Excel 导入/导出整文件进内存（xlsx 库内存敏感）
- **位置**：`src/main/ipc/excel.handler.ts:130-149`（`XLSX.readFile` 整文件解析 + `sheet_to_json` 全量）、`:36-58`（导出全量行）
- **影响**：主进程（Node 默认 ~2GB）大 Excel 导入可能 OOM 拖垮整个应用
- **修复**：导入限文件大小（如 20MB）+ 分块处理；导出走流式

---

## 正面结论（审计确认无问题）

- **定时器清理**：除 LoginPage rAF 外，所有 setInterval/setTimeout 均有 cleanup（DashboardPage:88 / AccountMonitorPage:183 / NotificationBell:76 / SettingsPage:47 / StockMarketPage:160 / GlobeView:226）✅
- **N+1 查询**：未发现——contract.repo `list()` 单条 JOIN 查询、`getById()` 2 条、dashboard.repo 纯标量子查询；云端 `list_contracts` 单查询 + 行内字段映射 ✅
- **索引覆盖**：19 个索引，contracts/account_transactions/audit_logs/notifications 关键过滤列均有 ✅（唯一缺口 created_at 排序，见 P2-3）
- **启动流程**：DB 初始化（sql.js 内存库加载）+ 19 迁移 + seed 实测 ~1.1s，非启动瓶颈；窗口 ready-to-show 再显示无白屏 ✅
- **数据安全**：单实例锁 + 原子落盘（tmp+rename）+ .bak + 自动备份保留 10 份 ✅
- **降级设计**：Dashboard 行情失败有 quoteFailed 降级提示、LoginPage cloudLogin 静默降级、iframe 20s 超时 + 重试（StockMarketPage:32,176）✅

## 修复优先级建议

1. 先做 P0-2（cloudFetch 统一加超时 + 轮询 in-flight 守卫，改动集中在 cloudApi.ts + 4 个页面）——默认云端模式下断网体验的直接修复
2. P0-1（LoginPage rAF cancel，10 行改动）+ P0-4（initDatabase try/catch 回退，30 行）
3. P0-3（uncaughtException/render-process-gone/relaunch，index.ts 内 ~40 行）
4. P1 四件（分页、监控轮询、云端 WAL、.bak 限频）
5. P2 打包（asar+locales+debug 清理，electron-builder.yml 配置级改动，收益最大）
