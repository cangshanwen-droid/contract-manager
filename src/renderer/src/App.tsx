import { useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import RegionListPage from './pages/RegionListPage'
import ContractListPage from './pages/ContractListPage'
import CompanyListPage from './pages/CompanyListPage'
import InfrastructureListPage from './pages/InfrastructureListPage'
import CalculatePage from './pages/CalculatePage'
import TrendsPage from './pages/TrendsPage'
import LandAreaReport from './pages/LandAreaReport'
import InfraCalculator from './pages/InfraCalculator'
import GipfelPlatform from './pages/GipfelPlatform'
import SettingsPage from './pages/SettingsPage'

const appTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#f59e0b',
    colorBgBase: '#0a0e17',
    colorBgContainer: '#111827',
    colorBgElevated: '#1a2332',
    colorBorder: '#2d3a4e',
    colorTextBase: '#f1f5f9',
    colorTextSecondary: '#cbd5e1',
    borderRadius: 6,
    fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: 13
  },
  components: {
    Layout: { bodyBg: '#0a0e17', headerBg: '#111827', siderBg: '#111827', triggerBg: '#1a2332' },
    Menu: {
      darkItemBg: '#111827',
      darkItemSelectedBg: 'rgba(245, 158, 11, 0.12)',
      darkItemSelectedColor: '#f59e0b',
      darkItemColor: '#94a3b8',
      darkItemHoverColor: '#e8edf5',
      itemBorderRadius: 8,
      darkSubMenuItemBg: '#0a0e17'
    },
    Card: { colorBgContainer: '#1e293b', paddingLG: 16 },
    Table: { headerBg: '#1a2332', headerColor: '#94a3b8', rowHoverBg: 'rgba(245, 158, 11, 0.04)', borderColor: 'rgba(45, 58, 78, 0.5)' },
    Modal: { contentBg: '#111827', headerBg: 'transparent' },
    Statistic: { contentFontFamily: "'JetBrains Mono', monospace" }
  }
}

function App(): JSX.Element {
  const [user, setUser] = useState<{ id: number; username: string; role: string } | null>(null)

  return (
    <ConfigProvider locale={zhCN} theme={appTheme as any}>
      {!user ? (
        <LoginPage onLogin={setUser} />
      ) : (
        <HashRouter>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="regions" element={<RegionListPage />} />
              <Route path="contracts" element={<ContractListPage />} />
              <Route path="companies" element={<CompanyListPage />} />
              <Route path="infrastructure" element={<InfrastructureListPage />} />
              <Route path="calculate" element={<CalculatePage />} />
              <Route path="trends" element={<TrendsPage />} />
              <Route path="land-area" element={<LandAreaReport />} />
              <Route path="infra-calc" element={<InfraCalculator />} />
              <Route path="gipfel" element={<GipfelPlatform />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </HashRouter>
      )}
    </ConfigProvider>
  )
}

export default App
