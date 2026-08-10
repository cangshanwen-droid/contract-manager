import React, { useState, useEffect, useCallback } from 'react'
import { Card, Typography, Button, Space, message, Switch, Divider, Input, Alert, Modal } from 'antd'
import { DownloadOutlined, UploadOutlined, DatabaseOutlined, ClockCircleOutlined, CloudOutlined, FileExcelOutlined, RollbackOutlined, SaveOutlined, ApiOutlined, ReloadOutlined } from '@ant-design/icons'
import { IPC_CHANNELS } from '../../../shared/constants'
import { isCloudMode, setCloudMode, invoke } from '../api/cloudApi'
import { tokens as T } from '../styles/design-tokens'

const SettingsPage: React.FC = () => {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [backing, setBacking] = useState(false)
  const [restoring, setRestoring] = useState(false)
  // 记录当前正在导出的数据表（contracts / regions / accounts / all），null 表示空闲
  const [excelExporting, setExcelExporting] = useState<string | null>(null)
  const [autoBackup, setAutoBackup] = useState(() => localStorage.getItem('autoBackup') === 'true')
  const [dbInfo, setDbInfo] = useState<{ path: string; size_formatted: string } | null>(null)
  const [cloudMode, setCloudModeState] = useState(isCloudMode)
  // ── 服务器状态 ──
  const [health, setHealth] = useState<any>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  const loadDbInfo = useCallback(async () => {
    try { setDbInfo(await invoke(IPC_CHANNELS.DB_INFO) as any) } catch { /* */ }
  }, [])

  const loadHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const r = await invoke(IPC_CHANNELS.SYSTEM_HEALTH) as any
      if (r?.success) setHealth(r.health)
      else message.error(r?.message || '健康检查失败')
    } catch (e: any) {
      message.error('健康检查失败：' + (e?.message || '未知错误'))
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => { loadDbInfo() }, [loadDbInfo])
  useEffect(() => { loadHealth() }, [loadHealth])

  useEffect(() => {
    if (!autoBackup) return
    const t = setInterval(() => { invoke(IPC_CHANNELS.DB_AUTO_BACKUP).catch(() => {}) }, 30 * 60 * 1000)
    return () => clearInterval(t)
  }, [autoBackup])

  const doExport = async () => {
    setExporting(true)
    try { const r = await invoke(IPC_CHANNELS.EXCEL_EXPORT) as any; r.success ? message.success('导出成功') : message.info(r.message) }
    catch (e: any) { message.error(e.message) }
    finally { setExporting(false) }
  }

  // 一键备份到桌面（带时间戳）
  const doBackupToDesktop = async () => {
    setBacking(true)
    try {
      const r = await invoke(IPC_CHANNELS.DB_BACKUP_TO_DESKTOP) as any
      if (r.success) message.success(`已备份到桌面：${r.fileName}`)
      else message.info(r.message)
    } catch (e: any) { message.error(e.message) }
    finally { setBacking(false) }
  }

  // 恢复数据库：先弹确认框警告覆盖当前数据
  const doRestore = () => {
    Modal.confirm({
      title: '确认恢复数据库？',
      icon: <RollbackOutlined style={{ color: '#fa541c' }} />,
      content: (
        <div style={{ fontSize: 13 }}>
          <p style={{ marginBottom: 8 }}>
            <b style={{ color: '#fa541c' }}>恢复将覆盖当前所有数据，且无法撤销。</b>
          </p>
          <p style={{ marginBottom: 0, color: T.silver3 }}>
            请先确认已执行备份，或所选备份文件包含需要的数据。建议恢复前先做一次备份。
          </p>
        </div>
      ),
      okText: '继续恢复',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setRestoring(true)
        try {
          const r = await invoke(IPC_CHANNELS.DB_RESTORE) as any
          if (r.success) {
            message.success('恢复成功，数据已更新')
            loadDbInfo()
          } else {
            message.info(r.message || '已取消')
          }
        } catch (e: any) { message.error('恢复失败: ' + e.message) }
        finally { setRestoring(false) }
      }
    })
  }

  // 单表一键导出 Excel
  const doExportTable = async (key: 'contracts' | 'regions' | 'accounts', channel: string, label: string) => {
    setExcelExporting(key)
    try {
      const r = await invoke(channel) as any
      r.success ? message.success(`${label}导出成功`) : message.info(r.message)
    } catch (e: any) { message.error(`${label}导出失败: ` + e.message) }
    finally { setExcelExporting(null) }
  }

  const cardStyle: React.CSSProperties = {
    background: T.card,
    border: `1px solid ${T.border}`,
    borderRadius: 4,
    marginBottom: 12,
    padding: 16,
  }

  const cardTitleStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: T.silver,
    marginBottom: 12,
  }

  /** 健康状态行：状态点 + 名称 + 结果 + 延迟 + 详情 */
  const statusRow = (label: string, item: { ok?: boolean; latency_ms?: number | null; message?: string } | undefined) => {
    const checked = !!item
    const ok = !!item?.ok
    const dotColor = !checked ? T.silver3 : ok ? T.success : T.error
    const textColor = !checked ? T.silver3 : ok ? T.success : T.error
    return (
      <div key={label} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${T.border}`, borderRadius: 4,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0,
          boxShadow: checked ? `0 0 6px ${dotColor}66` : 'none',
        }} />
        <span style={{ fontSize: 12, color: T.silver, width: 110, flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: 12, color: textColor, fontWeight: 500, flexShrink: 0 }}>
          {!checked ? '检测中…' : ok ? '正常' : '异常'}
        </span>
        {checked && item?.latency_ms != null && (
          <span style={{ fontSize: 11, color: T.silver3, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {item.latency_ms} ms
          </span>
        )}
        {checked && item?.message && (
          <span style={{
            fontSize: 11, color: T.silver3, marginLeft: 'auto', textAlign: 'right',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.message}
          </span>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* 云端模式 */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>
          <CloudOutlined style={{ marginRight: 6 }} />云端模式
        </div>
        <div style={{ fontSize: 12, color: T.silver2, marginBottom: 12 }}>
          开启后，所有数据页面直接从 <code style={{ color: T.accent }}>106.54.26.86</code> 云端读取数据，绕过本地 SQLite
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Switch
            checked={cloudMode}
            onChange={(v) => {
              setCloudModeState(v)
              setCloudMode(v)
              message.info(v ? '已切换到云端模式 — 数据将从 106.54.26.86 读取，请刷新页面生效' : '已切回本地模式 — 数据将从本地数据库读取，请刷新页面生效', 4)
            }}
          />
          <span style={{ fontSize: 13, color: cloudMode ? T.accent : T.silver3, fontWeight: 500 }}>
            {cloudMode ? '● 云端模式' : '○ 本地模式'}
          </span>
        </div>
        {cloudMode && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}
            message="当前使用云端数据源"
            description={
              <span style={{ fontSize: 11 }}>
                所有 region / company / contract / dashboard 数据将从 <code>https://106.54.26.86</code> 读取。
                认证使用 Gipfel 统一登录凭证，无需单独配置。
              </span>
            }
          />
        )}
      </div>

      {/* 数据管理 */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>
          <DatabaseOutlined style={{ marginRight: 6 }} />数据管理
        </div>
        <Space direction="vertical" style={{ width: '100%' }} size={0}>
          {/* 数据库备份 / 恢复 */}
          <div>
            <Typography.Text strong style={{ fontSize: 13, color: T.silver }}>
              <SaveOutlined style={{ marginRight: 6, color: T.silver3 }} />数据库备份与恢复
            </Typography.Text>
            <Typography.Paragraph type="secondary" style={{ margin: '4px 0 8px', fontSize: 12, color: T.silver3 }}>
              {dbInfo
                ? `当前数据库大小：${dbInfo.size_formatted}`
                : '加载数据库信息...'}
            </Typography.Paragraph>
            <Space wrap>
              <Button type="primary" size="small" icon={<DatabaseOutlined />} loading={backing} onClick={doBackupToDesktop}>
                一键备份到桌面
              </Button>
              <Button size="small" danger icon={<RollbackOutlined />} loading={restoring} onClick={doRestore}>
                恢复备份...
              </Button>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.silver2 }}>
                <ClockCircleOutlined /> 自动 <Switch size="small" checked={autoBackup}
                  onChange={(v) => { setAutoBackup(v); localStorage.setItem('autoBackup', String(v)) }} />
              </span>
            </Space>
            <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 11, color: T.silver3 }}>
              一键备份将把当前数据库（带时间戳）保存到系统桌面；恢复将从 .db 备份文件覆盖当前全部数据，操作前会弹出确认。
            </Typography.Paragraph>
          </div>

          <Divider style={{ margin: '14px 0', borderColor: T.border }} />

          {/* Excel 导出 / 导入 */}
          <div>
            <Typography.Text strong style={{ fontSize: 13, color: T.silver }}>
              <FileExcelOutlined style={{ marginRight: 6, color: '#4ade80' }} />Excel 导出 / 导入
            </Typography.Text>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: T.silver3, marginBottom: 6 }}>一键导出单张数据表：</div>
              <Space wrap>
                <Button size="small" icon={<DownloadOutlined />} loading={excelExporting === 'contracts'}
                  onClick={() => doExportTable('contracts', IPC_CHANNELS.EXCEL_EXPORT_CONTRACTS, '合同表')}>
                  导出合同表
                </Button>
                <Button size="small" icon={<DownloadOutlined />} loading={excelExporting === 'regions'}
                  onClick={() => doExportTable('regions', IPC_CHANNELS.EXCEL_EXPORT_REGIONS, '区域表')}>
                  导出区域表
                </Button>
                <Button size="small" icon={<DownloadOutlined />} loading={excelExporting === 'accounts'}
                  onClick={() => doExportTable('accounts', IPC_CHANNELS.EXCEL_EXPORT_ACCOUNT_TRANSACTIONS, '账户流水表')}>
                  导出账户流水表
                </Button>
              </Space>
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: T.silver3, marginBottom: 6 }}>全部数据表（多工作表）：</div>
              <Space>
                <Button type="primary" size="small" icon={<DownloadOutlined />} loading={exporting} onClick={doExport}>导出全部</Button>
                <Button size="small" icon={<UploadOutlined />} loading={importing}
                  onClick={async () => {
                    setImporting(true)
                    try {
                      const result = await invoke(IPC_CHANNELS.EXCEL_IMPORT) as any
                      if (result.success) message.success(result.message || '导入成功')
                      else message.info(result.message || '已取消')
                    } catch (e: any) { message.error('导入失败: ' + e.message) }
                    finally { setImporting(false) }
                  }}>导入</Button>
              </Space>
            </div>
          </div>
        </Space>
      </div>

      {/* 服务器状态 */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>
          <ApiOutlined style={{ marginRight: 6 }} />服务器状态
        </div>
        <div style={{ fontSize: 12, color: T.silver2, marginBottom: 12 }}>
          云端数据 API 与股票行情 API 健康检查 · 本地数据库状态（主机 106.54.26.86）
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {statusRow('云端数据 API', health?.cloud_api)}
          {statusRow('股票行情 API', health?.stock_api)}
          {statusRow('本地数据库', health ? { ok: health.db_ok, message: health.db_ok ? `连接正常 · ${health.db_tables ?? 0} 张数据表` : '数据库异常' } : undefined)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button size="small" icon={<ReloadOutlined />} loading={healthLoading} onClick={loadHealth}>
            重新检测
          </Button>
          <span style={{ fontSize: 11, color: T.silver3 }}>
            {health?.checked_at
              ? `检查时间 ${new Date(health.checked_at).toLocaleString('zh-CN')}`
              : '尚未检测'}
          </span>
          {dbInfo && (
            <span style={{ fontSize: 11, color: T.silver3, marginLeft: 'auto' }}>
              数据库大小：{dbInfo.size_formatted}
            </span>
          )}
        </div>
      </div>

      {/* 关于 */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>关于</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {[
              ['版本', '1.1.0'],
              ['技术', 'Electron · React 18 · TypeScript · SQLite'],
              ['引擎', 'Gipfel 商业模拟 3.0'],
              ['安全', 'PBKDF2 + 登录限流'],
              ['联动', '106.54.26.86'],
            ].map(([k, v], i) => (
              <tr key={k} style={{
                background: i % 2 === 0 ? T.warmDim : 'transparent',
              }}>
                <td style={{ padding: '6px 10px', color: T.silver3, width: 80 }}>{k}</td>
                <td style={{ padding: '6px 10px', color: T.silver }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default SettingsPage
