# Gipfel 管理系统 v1.2.1

基础设施合同管理与区域商业模拟系统（Electron 桌面应用）

## 功能

- 📊 仪表盘 — 决策驾驶舱，核心指标一览
- 🗺️ 区域管理 — 多区域人口/碳排/增长模拟
- 📝 合同管理 — 8种合同类型，搜索/筛选/编辑
- ✅ 审批流 — 提交 / 审批 / 驳回，驳回后可重新提交，决策结果自动通知
- 🕘 版本历史 — 合同修改记录可追溯
- 🔐 权限矩阵（RBAC）— 按角色控制页面与操作权限
- 🔔 通知中心 — 审批决策与合同状态变更提醒
- 👁️ 账户监控 — 登录与账户活动监控
- 🏢 公司管理 — 卡片视图，类型筛选
- 🧮 模拟计算 — 步骤化公式引擎，幸福度/就业率/人口/价格
- 🏗️ 基建计算 — 32种基础设施需求分析与补建
- 📐 占地面积 — 排行分析图表
- 🔗 股票联动 — 与 Gipfel Trading Arena 实时同步股价
- ☁️ 云端同步 — 默认开启，无需手动配置
- 🧪 测试套件 — vitest 单元测试 43 例（审批流 / 权限 / 格式化 / 股票联动）

## 快速开始

### 开发

```bash
npm install
npm run dev
```

### 构建安装包

```bash
npm run build            # 仅编译
npm run package          # 编译 + 生成 Windows 安装包 (NSIS)
npm run package:portable # 生成便携版 (免安装)
```

### 测试与校验

```bash
npm test                 # 运行 vitest 单元测试（43 例）
npm run verify           # 运行完整验证套件（本地 API + 云端 + UI）
npm run verify:local     # 仅本地验证
npm run verify:cloud     # 仅云端验证
npm run verify:ui        # 仅 UI 验证
npm run typecheck        # TypeScript 类型检查
```

## 首次使用

1. 双击安装包安装（或使用便携版）
2. 启动后使用默认账号登录：
   - 用户名: **admin**
   - 密码: **admin**
3. 建议首次登录后立即创建新管理员账号

## 模拟计算公式

### 幸福度
H = 0.6c + 0.1log(P+100) + 0.2(T/P) + 0.2(E/P)

### 就业率
E = 5×log10(P+100) + 25×B/(B+30)

### 人口迭代
P' = min(P + (P×g×H/100 + ΔP) × max(0, 1-P/K), K)

### 碳排放
C = max(2000, P×10 + C_extract - C_reduce)

### 成交价
P_sell = P_base × (1+H/100) × (1+(Qd-Qs)/Qd_max)

## 股票联动

在「设置」→「股票联动」配置管理员 Token 后，每次运行模拟计算会自动将区域经济指标同步到股票交易系统：

| Gipfel 指标 | 股票参数 | 映射规则 |
|------------|---------|---------|
| 幸福度 | premium_rate | 直接映射 (1-100) |
| 人均碳排放 | carbon_price | 碳排×10映射 |
| 人口变化 | revenue | 变化率调整 |

**注意**：需要 `gipfel-trading-api.onrender.com` 的管理员 Token。首次使用时 Token 留空不影响本地功能。

## 技术栈

- Electron 33 + React 18 + TypeScript
- Ant Design 5 (深色主题)
- SQLite (sql.js) — 数据文件位于 `%APPDATA%/contract-manager/`
- Recharts 图表库
- Vitest 单元测试

## 数据备份

- 设置页支持手动备份 / Excel 导入导出
- 开启自动备份后每 30 分钟自动备份一次

## 安全

- PBKDF2-SHA512 密码哈希 (100,000 次迭代)
- 登录限流 (5 次/分钟)
- IPC 错误处理全覆盖
- 数据库操作事务保护
- 凭据安全存储（safeStorage 加密 + adminKey 环境变量化）
- HTTPS 支持

## 许可

[MIT](LICENSE) © 2026 Gipfel Institutional Platform
