# Token 迁移清单 (UX P0-1 修复)

> 目标：`src/renderer/src/styles/design-tokens.ts` 为全系统唯一颜色来源，
> 消除「三源分裂」（design-tokens.ts / ConfigProvider / 页面硬编码 hex）。
> 生成时间：2026-08-10 · 全部替换为机械迁移，值以 design-tokens.ts 为准。

## 1. 映射规则（旧 hex → Token）

| 旧 hex | 语义 | 替换为 Token | Token 实际值 | 说明 |
|---|---|---|---|---|
| `#E2E8F0` | 主文字 | `T.textPrimary` | `#F5F7FA` | 审计要求"#E2E8F0 → T.text 或 #F5F7FA"；实际 token 名为 `textPrimary` |
| `#64748B` | 弱文字/占位 | `T.textMuted` | `rgba(138,155,181,0.5)` | 按审计指令映射（`silver3` 为保留的旧值别名，未采用） |
| `#94A3B8` | 次文字 | `T.textSecondary` | `#8A9BB5` | |
| `#1E2D40` | 边框 | `T.border` | `rgba(212,175,55,0.12)` | 边框语义，改用金调透明边框 token |
| `#111B2D` | 面板背景 | `T.panel`（= `T.bgPanel`） | `#0F2748` | 侧栏/顶栏/卡片底色 |
| `#0B1120` | 最深画布背景 | `T.bgRoot` | `#061A33` | ⚠️ 审计写的 `T.bgDeep` 不存在；最深背景的实际 token 为 `bgRoot`，按语义映射 |
| `#10B981` | 成功色 | `T.success` | `#22C55E` | ConfigProvider `colorSuccess` 显式修复点 |
| `#1A1F2E` | 卡片背景 | `T.bgCard` | `#1A1F2E` | 同值硬编码 → token 引用（单一来源） |
| `#0F1729` | 面板背景 | `T.bgPanel` | `#0F2748` | 同值硬编码 → token 引用 |
| `#8A9BB5` | 次文字 | `T.textSecondary` | `#8A9BB5` | 同值硬编码 → token 引用 |
| `#94a3b8` / `#e2e8f0` | 小写旧色板 | 同上 | — | ErrorBoundary/GlobeView/LogoSystem/TrendsPage 中的旧色板小写变体 |

### CSS 场景（`global.css` / `AppLayout.tsx` 内嵌 CSS 串）
使用 CSS 变量（值与 tokens 一一对应）：
- `#E2E8F0` → `var(--gipfel-text-primary)`
- `#94A3B8` → `var(--gipfel-text-secondary)`
- `#64748B` → `var(--gipfel-text-muted)`
- `#1E2D40` → `var(--gipfel-border)`
- `.kpi-breathing` / `.data-row::after` 已同步替换；`.data-row:hover::after` 的 `#D4AF37` → `var(--gipfel-primary)`

## 2. 替换清单（每文件出现次数，脚本实测）

| 文件 | 替换处数 | 主要替换 |
|---|---|---|
| `src/renderer/src/App.tsx` | 40 | `colorSuccess #10B981→T.success`；`colorBgBase/Layout.bodyBg #0B1120→T.bgRoot`；`Menu/Tabs/Breadcrumb/Table` 文字与背景 → `T.textPrimary/textSecondary/textMuted/T.bgPanel/T.border`；`#1A1F2E→T.bgCard`（10 处）；`Alert.colorSuccessBg rgba(16,185,129,0.10)→rgba(34,197,94,0.10)`；头部注释同步更新 |
| `src/renderer/src/components/layout/AppLayout.tsx` | 26 | 侧栏/顶栏 `#111B2D→T.panel`；布局背景 `#0B1120→T.bgRoot`；边框 `1px solid #1E2D40 → \`1px solid ${T.border}\``（5 处）；menuOverrideCSS 内嵌 CSS 用 `var(--gipfel-*)`（6 处）；面包屑/折叠按钮/页脚文字 → `T.textPrimary/textSecondary/textMuted` |
| `src/renderer/src/components/layout/GlobalSearch.tsx` | 8 | `#0B1120→T.bgRoot`、`#1E2D40→T.border`、`#E2E8F0→T.textPrimary`×3、`#64748B→T.textMuted`×3 |
| `src/renderer/src/components/layout/NotificationBell.tsx` | 11 | `#1A1F2E→T.bgCard`×2、`#1E2D40→T.border`、`#E2E8F0→T.textPrimary`×3、`#94A3B8→T.textSecondary`×3、`#64748B→T.textMuted` |
| `src/renderer/src/pages/StockMarketPage.tsx` | 36 | 标题 `#E2E8F0→T.textPrimary`×8（消除"标题 vs 股价 #F5F7FA 同页混用"）、`#111B2D→T.panel`×6、`#1E2D40→T.border`×7、`#0B1120→T.bgRoot`×3、`#64748B→T.textMuted`×8、`#94A3B8→T.textSecondary`×3、`#8A9BB5→T.textSecondary` |
| `src/renderer/src/pages/AccountMonitorPage.tsx` | 23 | `#111B2D→T.panel`×3、`#1E2D40→T.border`×4、`#E2E8F0→T.textPrimary`×7、`#64748B→T.textMuted`×5、`#0B1120→T.bgRoot`、`#0F1729→T.bgPanel`、`#8A9BB5→T.textSecondary`×2 |
| `src/renderer/src/pages/LoginPage.tsx` | 12 | `#8A9BB5→T.textSecondary`×12（补 `tokens as T` import） |
| `src/renderer/src/pages/UserManagementPage.tsx` | 2 | `ROLE_COLORS.rep #94A3B8→T.textSecondary`、Tag 兜底 `#64748B→T.textMuted` |
| `src/renderer/src/pages/CompanyListPage.tsx` | 1 | 卡片边框 `1px solid #1E2D40 → \`1px solid ${T.border}\`` |
| `src/renderer/src/pages/ContractListPage.tsx` | 1 | 面板背景 `#1A1F2E→T.bgCard`、边框改 `\`1px solid ${T.border}\`` |
| `src/renderer/src/components/ErrorBoundary.tsx` | 1 | `#94a3b8→T.textSecondary` |
| `src/renderer/src/components/GlobeView.tsx` | 9 | `#e2e8f0→T.textPrimary`×5、`#94a3b8→T.textSecondary`×4 |
| `src/renderer/src/components/LogoSystem.tsx` | 2 | `#e2e8f0→T.textPrimary`×2 |
| `src/renderer/src/pages/TrendsPage.tsx` | 2 | `#94a3b8→T.textSecondary`、`#e2e8f0→T.textPrimary` |
| `src/renderer/src/styles/global.css` | 6 | 头部注释 `accent: #3B82F6→#D4AF37`（整段色板描述同步更新）；`.kpi-breathing`、`.data-row::after` 改用 `var(--gipfel-*)` |

**合计 ≈ 180 处替换**，涉及 15 个文件。

## 3. 无对应 token 保留原值（记录）

| hex | 位置 | 原因 |
|---|---|---|
| `#253548` | App.tsx `colorBorderSecondary`、`Input.hoverBorderColor` | tokens 无该"中强边框"层级，保留并记录 |
| `#E5C158` / `#B8960A` | App.tsx `colorPrimaryHover/Active` | 金色明暗变体，非独立语义 token，保留 |
| `#0f0f0f` / `#1a2740` | TrendsPage.tsx Tooltip `contentStyle` | 无对应 token，保留 |
| `#FFFFFF` | global.css `.kpi-breathing:hover` | hover 高亮白，语义独立，保留 |

## 4. 保留的 token 定义（不替换）

- `design-tokens.ts` 中 `silver3: '#64748B'` 等 legacy 别名是 token 定义本身，保留。
- `global.css` `:root` 的 `--gipfel-*` 变量定义与 tokens 对齐（值一致），是 CSS 侧唯一来源，保留。
- `utils/format.ts` `POSITIVE_COLOR #22C55E` / `NEGATIVE_COLOR #EF4444` 值与 `T.success/T.error` 一致，保留（工具函数独立模块，避免循环依赖）。

## 5. 验证

- ✅ `npm run typecheck` — 通过
- ✅ `npm run build`（electron-vite） — 通过
- ✅ `npm test`（vitest） — 51/51 通过
