# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

管理端、操作端与代表端在桌面端处理区域、合同、基础设施、资金、市场和账户信息。代表端以只读查看为主；操作端与管理端在授权范围内执行业务操作。

## Product Purpose

Gipfel 是面向基础设施合同管理与区域模拟的机构级工作台，并提供账户与原生股票市场能力。成功意味着用户能在高信息密度下快速判断状态、定位记录并安全完成授权操作。

## Positioning

同一桌面工作台内，以角色权限约束统一呈现合同、区域、基础设施、资金与市场数据；不是把独立业务系统拼接在一起。

## Operating Context

用户在 Windows 桌面端、长时间案头工作场景下使用系统，常见任务是筛选表格、审核合同、维护区域与基础设施数据、查看资金和市场账户。数据表、筛选、弹窗和快捷键是核心交互。

## Capabilities and Constraints

- React 18、Ant Design 5、Electron Vite 桌面端；保留现有路由、权限和业务行为。
- 管理端与操作端拥有完整的授权功能；代表端不得看到股票买卖入口。
- 货币格式为 `¥1,234.56`；中文用户名在 URL 中必须编码；金融操作需幂等键。
- 视觉基调必须保留深海军蓝 `#061A33` / `#0F2748` 与香槟金 `#D4AF37`，不使用 emoji、渐变、霓虹、发光或大圆角。

## Brand Commitments

Gipfel 管理系统使用现有金色标识；语言应准确、克制、机构化，强调可信的业务信息而非消费级装饰。

## Evidence on Hand

- 现有 React 页面和 Ant Design 组件：`src/renderer/src/`。
- 品牌资产：`src/renderer/src/assets/`。
- 用户提供的仪表盘、区域管理、合同总览、基础设施与登录页截图。

## Product Principles

1. 角色与权限必须在信息与操作入口上清晰可见。
2. 数据密度服务于扫描效率，不能以装饰牺牲可读性。
3. 关键操作保持可预期、可聚焦并有明确反馈。
4. 一套设计语言贯穿所有业务模块。

## Accessibility & Inclusion

键盘可达、可见焦点、明确表单标签、足够的文字与状态对比度，并为非必要动效提供 `prefers-reduced-motion` 降级。
