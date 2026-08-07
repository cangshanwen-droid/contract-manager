import React, { useState, useEffect, useCallback } from 'react'
import { Card, Typography, Descriptions, Button, Space, message, Switch, Modal, Divider } from 'antd'
import { DownloadOutlined, UploadOutlined, DatabaseOutlined, ClockCircleOutlined } from '@ant-design/icons'

const SettingsPage: React.FC = () => {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [backing, setBacking] = useState(false)
  const [autoBackup, setAutoBackup] = useState(() => {
    return localStorage.getItem('autoBackup') === 'true'
  })
  const [dbInfo, setDbInfo] = useState<{ path: string; size_formatted: string; size: number } | null>(null)

  const loadDbInfo = useCallback(async () => {
    try {
      const info = await window.api.invoke('db:info') as any
      setDbInfo(info)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadDbInfo()
  }, [loadDbInfo])

  // 定时自动备份 (每 30 分钟)
  useEffect(() => {
    if (!autoBackup) return
    const timer = setInterval(async () => {
      try {
        await window.api.invoke('db:auto-backup')
        console.log('Auto backup completed')
      } catch { /* ignore */ }
    }, 30 * 60 * 1000)
    return () => clearInterval(timer)
  }, [autoBackup])

  const handleAutoBackupToggle = (checked: boolean) => {
    setAutoBackup(checked)
    localStorage.setItem('autoBackup', String(checked))
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const result = await window.api.invoke('excel:export') as any
      if (result.success) {
        message.success(`数据已导出到: ${result.path}`)
      } else {
        message.info(result.message || '导出已取消')
      }
    } catch (err: any) {
      message.error('导出失败: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  const handleImport = () => {
    Modal.confirm({
      title: '确认导入',
      content: '导入操作会向现有数据追加新记录（不会覆盖已有数据）。工作表名称需与系统表名匹配。确定要继续吗？',
      okText: '选择文件并导入',
      cancelText: '取消',
      onOk: async () => {
        setImporting(true)
        try {
          const result = await window.api.invoke('excel:import') as any
          if (result.success) {
            message.success(result.message)
            if (result.errors?.length) {
              Modal.warning({
                title: '部分导入失败',
                content: result.errors.join('\n')
              })
            }
            loadDbInfo()
          } else {
            message.info(result.message || '导入已取消')
          }
        } catch (err: any) {
          message.error('导入失败: ' + err.message)
        } finally {
          setImporting(false)
        }
      }
    })
  }

  const handleBackup = async () => {
    setBacking(true)
    try {
      const result = await window.api.invoke('db:backup') as any
      if (result.success) {
        message.success(`数据库已备份到: ${result.path}`)
      } else {
        message.info(result.message || '备份已取消')
      }
    } catch (err: any) {
      message.error('备份失败: ' + err.message)
    } finally {
      setBacking(false)
    }
  }

  return (
    <div>
      <Typography.Title level={4}>系统设置</Typography.Title>

      <Card title="数据管理" size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Typography.Text strong>Excel 导入/导出</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ margin: '4px 0 12px' }}>
              将系统数据导出为 Excel 文件，或从 Excel 文件导入数据
            </Typography.Paragraph>
            <Space>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                loading={exporting}
                onClick={handleExport}
              >
                导出所有数据
              </Button>
              <Button
                icon={<UploadOutlined />}
                loading={importing}
                onClick={handleImport}
              >
                从 Excel 导入
              </Button>
            </Space>
          </div>

          <Divider style={{ margin: '8px 0' }} />

          <div>
            <Typography.Text strong>
              <DatabaseOutlined style={{ marginRight: 8 }} />
              数据库备份
            </Typography.Text>
            <Typography.Paragraph type="secondary" style={{ margin: '4px 0 12px' }}>
              {dbInfo ? (
                <>数据库路径: {dbInfo.path} | 大小: {dbInfo.size_formatted}</>
              ) : '正在加载...'}
            </Typography.Paragraph>
            <Space>
              <Button
                icon={<DatabaseOutlined />}
                loading={backing}
                onClick={handleBackup}
              >
                手动备份
              </Button>
              <span>
                <ClockCircleOutlined style={{ marginRight: 4 }} />
                自动备份（每30分钟）
                <Switch
                  checked={autoBackup}
                  onChange={handleAutoBackupToggle}
                  style={{ marginLeft: 8 }}
                />
              </span>
            </Space>
            {autoBackup && (
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                自动备份文件保存在应用数据目录下的 backups 文件夹，最多保留 10 个备份
              </Typography.Text>
            )}
          </div>
        </Space>
      </Card>

      <Card title="关于系统" size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="系统名称">基础设施合同管理 + 区域模拟系统</Descriptions.Item>
          <Descriptions.Item label="版本">1.0.0</Descriptions.Item>
          <Descriptions.Item label="技术栈">Electron + React + TypeScript + SQLite</Descriptions.Item>
          <Descriptions.Item label="公式引擎">Gipfel 商业模拟 3.0</Descriptions.Item>
          <Descriptions.Item label="安全">
            PBKDF2-SHA512 密码哈希 + 登录限流保护
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="功能说明" size="small">
        <ul>
          <li><b>区域管理</b>：维护区域的人口、承载力、碳排放等基础参数</li>
          <li><b>合同管理</b>：记录基础设施项目合同，包含占地面积追踪</li>
          <li><b>公司管理</b>：维护施工方、设计方、供应商等合作公司信息</li>
          <li><b>模拟计算</b>：基于 Gipfel 公式计算区域幸福度/就业率/人口变化</li>
          <li><b>趋势分析</b>：多期数据可视化，观察指标变化趋势</li>
        </ul>
      </Card>
    </div>
  )
}

export default SettingsPage
