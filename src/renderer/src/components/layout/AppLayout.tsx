import React, { useState } from 'react'
import { Layout, Menu, Typography } from 'antd'
import {
  DashboardOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  BuildOutlined,
  TeamOutlined,
  SettingOutlined,
  CalculatorOutlined,
  BarChartOutlined,
  PieChartOutlined,
  GlobalOutlined
} from '@ant-design/icons'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { LOGO_B64 } from './logo-b64'

const { Sider, Content, Header } = Layout

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/regions', icon: <EnvironmentOutlined />, label: '区域管理' },
  { key: '/contracts', icon: <FileTextOutlined />, label: '合同管理' },
  { key: '/companies', icon: <TeamOutlined />, label: '公司管理' },
  { key: '/infrastructure', icon: <BuildOutlined />, label: '基建类型' },
  { key: '/gipfel', icon: <GlobalOutlined />, label: 'Gipfel平台' },
  { key: '/infra-calc', icon: <CalculatorOutlined />, label: '基建辅助计算' },
  { key: '/calculate', icon: <BarChartOutlined />, label: '模拟计算' },
  { key: '/trends', icon: <PieChartOutlined />, label: '趋势分析' },
  { key: '/land-area', icon: <BuildOutlined />, label: '占地面积报表' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' }
]

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const selectedKey = '/' + location.pathname.split('/')[1]

  return (
    <Layout style={{ height: '100vh', background: '#0a0e17' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        style={{
          background: '#111827',
          borderRight: '1px solid rgba(45, 58, 78, 0.5)',
          overflow: 'auto'
        }}
      >
        {/* Logo area with user's image */}
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? 0 : '0 16px',
            borderBottom: '1px solid rgba(45, 58, 78, 0.3)',
            background: 'linear-gradient(135deg, rgba(245,158,11,0.06), transparent)'
          }}
        >
          <img
            src={LOGO_B64}
            alt="logo"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              objectFit: 'cover',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(245,158,11,0.2)'
            }}
          />
          {!collapsed && (
            <span
              style={{
                marginLeft: 12,
                fontSize: 15,
                fontWeight: 600,
                color: '#e8edf5',
                letterSpacing: '0.03em',
                whiteSpace: 'nowrap'
              }}
            >
              Gipfel管理系统
            </span>
          )}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{
            background: 'transparent',
            borderRight: 'none',
            padding: '8px 8px'
          }}
        />
      </Sider>

      <Layout style={{ background: '#0a0e17' }}>
        <Header
          style={{
            background: '#111827',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(45, 58, 78, 0.5)',
            height: 56
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 2,
                height: 20,
                background: 'linear-gradient(180deg, #f59e0b, #06b6d4)',
                borderRadius: 1
              }}
            />
            <Typography.Text
              style={{
                color: '#94a3b8',
                fontSize: 13,
                fontWeight: 400,
                letterSpacing: '0.03em'
              }}
            >
              Gipfel管理系统 · 基础设施合同管理 · 区域模拟系统
            </Typography.Text>
          </div>
        </Header>

        <Content
          style={{
            margin: 16,
            padding: 0,
            overflow: 'auto',
            borderRadius: 8
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout
