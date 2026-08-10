import { useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import AppLayout from './components/layout/AppLayout'
import RoleGuard from './components/RoleGuard'
import { AuthProvider } from './context/AuthContext'
import { IPC_CHANNELS } from '../../shared/constants'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import RegionListPage from './pages/RegionListPage'
import ContractListPage from './pages/ContractListPage'
import CompanyListPage from './pages/CompanyListPage'
import InfrastructureListPage from './pages/InfrastructureListPage'
import CalculatePage from './pages/CalculatePage'
import LandAreaReport from './pages/LandAreaReport'
import InfraCalculator from './pages/InfraCalculator'
import StockMarketPage from './pages/StockMarketPage'
import AccountMonitorPage from './pages/AccountMonitorPage'
import AccountPage from './pages/AccountPage'
import SettingsPage from './pages/SettingsPage'
import UserManagementPage from './pages/UserManagementPage'
import AnnouncementPage from './pages/AnnouncementPage'
import { tokens as T } from './styles/design-tokens'

/*
 /* ═══════════════════════════════════════════════════════════════════════════════
   * Gipfel Design System v6.0 - 统一金融金 Gold Unified
   * ═══════════════════════════════════════════════════════════════════════════════
   *
   * 设计方向：金融金统一 - 深海蓝黑基底 × 暖金 accent #D4AF37 × 单一来源 design-tokens.ts
   * 原则：design-tokens.ts 为全系统唯一颜色来源，禁止页面内联 T 对象。
   *
   * 色彩系统：
   *   ── 背景栈 (3 层) ──
   *   #061A33  画布 - 页面根背景，最深 (T.bgRoot)
   *   #0F2748  面板 - 侧栏/顶栏 (T.bgPanel)
   *   #1A1F2E  卡片 - 内容卡片/KPI卡片/弹窗 (T.bgCard)
   *
   *   ── Accent: #D4AF37 金融金 ──
   *
   *   ── 文字层级 (3 层) ──
   *   #F5F7FA  主文字 - 标题、正文、KPI 数值 (T.textPrimary)
   *   #8A9BB5  次文字 - 标签、描述、辅助信息 (T.textSecondary)
   *   rgba(138,155,181,0.5)  弱文字 - placeholder、禁用态、面包屑 (T.textMuted)
   */

const appTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    // ── Primary: #D4AF37 Gold (金融金) ──
    colorPrimary: '#D4AF37',
    colorPrimaryBg: 'rgba(212, 175, 55, 0.08)',
    colorPrimaryBgHover: 'rgba(212, 175, 55, 0.14)',
    colorPrimaryBorder: 'rgba(212, 175, 55, 0.25)',
    colorPrimaryBorderHover: 'rgba(212, 175, 55, 0.40)',
    colorPrimaryHover: '#E5C158',
    colorPrimaryActive: '#B8960A',

    // ── Semantic: 金融级语义色 ──
    colorSuccess: T.success,
    colorWarning: '#D4AF37',
    colorError: '#EF4444',
    colorInfo: '#D4AF37',

    // ── Luminance Stacking: 3-layer background ──
    //   canvas T.bgRoot(#061A33) → panel T.bgPanel(#0F2748) → card T.bgCard(#1A1F2E)
    colorBgBase: T.bgRoot,
    colorBgContainer: T.bgCard,
    colorBgElevated: T.bgCard,
    colorBgLayout: T.bgRoot,
    colorBgSpotlight: T.bgCard,
    colorBgMask: 'rgba(0, 0, 0, 0.75)',

    // ── Borders: 3-layer solid micro-borders ──
    //   border: T.border (rgba(212,175,55,0.12)) — #253548 无对应 token，保留
    colorBorder: T.border,
    colorBorderSecondary: '#253548',

    // ── Text: 3-layer hierarchy ──
    //   primary T.textPrimary → secondary T.textSecondary → weak T.textMuted
    colorTextBase: T.textPrimary,
    colorText: T.textPrimary,
    colorTextSecondary: T.textSecondary,
    colorTextTertiary: T.textMuted,
    colorTextQuaternary: T.textMuted,

    // ── Shape: 4px 金融克制圆角 ──
    borderRadius: 4,
    borderRadiusLG: 4,
    borderRadiusSM: 4,
    borderRadiusXS: 3,

    // ── Typography: 中文优先 Microsoft YaHei + 数字 SF Pro Display ──
    //   字号层级 24/18/14/12 - 字间距 标题-0.02em / 正文normal
    //   行高 - 标题1.2 / 正文1.55
    fontFamily: "'Microsoft YaHei', 'PingFang SC', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    fontFamilyCode: "'JetBrains Mono', 'Consolas', 'Cascadia Code', 'SF Mono', monospace",
    fontSize: 14,
    fontSizeLG: 18,
    fontSizeSM: 12,
    fontSizeXL: 24,

    // ── Spacing & Line Height ──
    lineHeight: 1.55,
    controlHeight: 32,
    controlHeightLG: 38,
    controlHeightSM: 26,

    paddingXS: 8,
    paddingSM: 12,
    padding: 16,
    paddingMD: 20,
    paddingLG: 24,

    // ── Zero box-shadow - hierarchy via luminance only ──
    boxShadow: 'none',
    boxShadowSecondary: 'none',
    boxShadowTertiary: 'none',

    wireframe: false,
  },
  components: {
    // ── Layout ──
    Layout: {
      bodyBg: T.bgRoot,
      headerBg: T.bgPanel,
      siderBg: T.bgPanel,
      triggerBg: T.bgPanel,
    },

    // ── Menu (Navigation) ──
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: T.textMuted,
      darkItemHoverColor: T.textPrimary,
      darkItemSelectedColor: '#D4AF37',
      darkItemSelectedBg: 'rgba(212, 175, 55, 0.12)',
      darkItemHoverBg: 'rgba(212, 175, 55, 0.05)',
      darkSubMenuItemBg: 'transparent',
      itemBorderRadius: 4,
      itemMarginInline: 8,
      itemHeight: 40,
    },

    // ── Card ──
    Card: {
      colorBgContainer: T.bgCard,
      paddingLG: 16,
      borderRadiusLG: 4,
      boxShadow: 'none',
    },

    // ── Table ──
    Table: {
      headerBg: T.bgPanel,
      headerColor: T.textSecondary,
      headerSplitColor: T.border,
      rowHoverBg: 'rgba(212, 175, 55, 0.05)',
      borderColor: T.border,
      cellPaddingBlock: 10,
      cellPaddingInline: 16,
    },

    // ── Modal ──
    Modal: {
      contentBg: T.bgCard,
      headerBg: T.bgCard,
      borderRadiusLG: 4,
    },

    // ── Statistic (financial numbers) ──
    Statistic: {
      contentFontFamily: "'JetBrains Mono', 'Consolas', 'SF Mono', system-ui, monospace",
    },

    // ── Button ──
    Button: {
      borderRadius: 4,
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none',
      fontWeight: 500,
    },

    // ── Input ──
    Input: {
      borderRadius: 4,
      activeBorderColor: '#D4AF37',
      hoverBorderColor: '#253548',
      activeShadow: '0 0 0 2px rgba(212, 175, 55, 0.25)',
    },

    // ── Select ──
    Select: {
      borderRadius: 4,
    },

    // ── Tag ──
    Tag: {
      borderRadiusSM: 3,
    },

    // ── Tabs ──
    Tabs: {
      itemColor: T.textMuted,
      itemHoverColor: T.textPrimary,
      itemSelectedColor: '#D4AF37',
      inkBarColor: '#D4AF37',
      titleFontSize: 13,
    },

    // ── Breadcrumb ──
    Breadcrumb: {
      itemColor: T.textMuted,
      lastItemColor: T.textPrimary,
      linkColor: T.textSecondary,
      linkHoverColor: '#D4AF37',
      fontSize: 12,
    },

    // ── Tooltip ──
    Tooltip: {
      colorBgSpotlight: T.bgCard,
    },

    // ── Dropdown ──
    Dropdown: {
      colorBgElevated: T.bgCard,
    },

    // ── Notification ──
    Notification: {
      colorBgElevated: T.bgCard,
    },

    // ── Popover ──
    Popover: {
      colorBgElevated: T.bgCard,
    },

    // ── Alert ──
    Alert: {
      colorSuccessBg: 'rgba(34, 197, 94, 0.10)',
      colorErrorBg: 'rgba(239, 68, 68, 0.10)',
      colorWarningBg: 'rgba(212, 168, 56, 0.10)',
      colorInfoBg: 'rgba(212, 175, 55, 0.10)',
    },
  },
}

function App(): JSX.Element {
  const [user, setUser] = useState<{ id: number; username: string; role: string; permissions?: string[] } | null>(null)

  // 退出登录：通知主进程清除会话（后端权限校验依据）
  const handleLogout = () => {
    window.api.invoke(IPC_CHANNELS.AUTH_LOGOUT).catch(() => {})
    setUser(null)
  }

  return (
    <ConfigProvider locale={zhCN} theme={appTheme as any}>
      {!user ? (
        <LoginPage onLogin={setUser} />
      ) : (
        <HashRouter>
          <AuthProvider user={user}>
          <Routes>
            <Route path="/" element={<AppLayout onLogout={handleLogout} username={user?.username} role={user?.role} />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="regions" element={<RoleGuard route="regions"><RegionListPage /></RoleGuard>} />
              <Route path="contracts" element={<RoleGuard route="contracts"><ContractListPage /></RoleGuard>} />
              <Route path="companies" element={<RoleGuard route="companies"><CompanyListPage /></RoleGuard>} />
              <Route path="infrastructure" element={<RoleGuard route="infrastructure"><InfrastructureListPage /></RoleGuard>} />
              <Route path="calculate" element={<RoleGuard route="calculate"><CalculatePage /></RoleGuard>} />
              <Route path="land-area" element={<RoleGuard route="land-area"><LandAreaReport /></RoleGuard>} />
              <Route path="infra-calc" element={<RoleGuard route="infra-calc"><InfraCalculator /></RoleGuard>} />
              <Route path="stocks" element={<RoleGuard route="stocks"><StockMarketPage /></RoleGuard>} />
              <Route path="account-monitor" element={<RoleGuard route="account-monitor"><AccountMonitorPage /></RoleGuard>} />
              <Route path="accounts" element={<RoleGuard route="accounts"><AccountPage /></RoleGuard>} />
              <Route path="settings" element={<RoleGuard route="settings"><SettingsPage /></RoleGuard>} />
              <Route path="users" element={<RoleGuard route="users"><UserManagementPage currentUserId={user?.id} currentUserRole={user?.role} /></RoleGuard>} />
              <Route path="announcements" element={<RoleGuard route="announcements"><AnnouncementPage /></RoleGuard>} />
            </Route>
          </Routes>
          </AuthProvider>
        </HashRouter>
      )}
    </ConfigProvider>
  )
}

export default App
