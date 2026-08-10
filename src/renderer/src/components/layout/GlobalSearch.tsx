/**
 * GlobalSearch - 顶栏全局搜索（操作端效率工具）
 *
 * - 搜索范围：合同（编号/名称）+ 区域（名称）
 * - 数据源：进入布局时惰性加载一次（数据量小），下拉分组展示
 * - 选择合同 → 跳转合同列表并定位（/contracts?q=编号）
 * - 选择区域 → 跳转区域列表并过滤（/regions?q=名称）
 * - 直接回车 → 跳转合同列表按关键词过滤
 * - 快捷键 Ctrl+K 聚焦搜索框
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AutoComplete, Input } from 'antd'
import { SearchOutlined, FileTextOutlined, EnvironmentOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { invoke } from '../../api/cloudApi'
import { useAuth } from '../../context/AuthContext'
import { IPC_CHANNELS } from '../../../../shared/constants'
import { tokens as T } from '../../styles/design-tokens'

interface SearchOption {
  value: string
  label: React.ReactNode
  type: 'contract' | 'region'
  key: string
}

const GlobalSearch: React.FC = () => {
  const navigate = useNavigate()
  const authUser = useAuth()
  const role = authUser?.role
  const [input, setInput] = useState('')
  const [contracts, setContracts] = useState<any[]>([])
  const [regions, setRegions] = useState<any[]>([])
  const inputRef = useRef<any>(null)

  // ── 惰性加载索引数据 ──
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [c, r] = await Promise.all([
          invoke(IPC_CHANNELS.CONTRACT_LIST) as Promise<any[]>,
          invoke(IPC_CHANNELS.REGION_LIST) as Promise<any[]>,
        ])
        if (!mounted) return
        setContracts(c || [])
        setRegions(r || [])
      } catch { /* 索引加载失败静默，下拉为空 */ }
    })()
    return () => { mounted = false }
  }, [])

  // ── Ctrl+K 聚焦 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const kw = input.trim().toLowerCase()

  // ── 过滤 + 分组选项 ──
  const options = useMemo(() => {
    const contractOpts: SearchOption[] = contracts
      .filter((c: any) =>
        !kw ||
        (c.contract_no || '').toLowerCase().includes(kw) ||
        (c.contract_name || '').toLowerCase().includes(kw)
      )
      .slice(0, 8)
      .map((c: any) => ({
        key: `c-${c.id}`,
        value: c.contract_no || `#${c.id}`,
        type: 'contract' as const,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileTextOutlined style={{ color: '#D4AF37', fontSize: 12 }} />
            <span style={{ color: T.textPrimary, fontSize: 12 }}>{c.contract_no || `#${c.id}`}</span>
            <span style={{ color: T.textMuted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
              {c.contract_name || ''}
            </span>
          </div>
        ),
      }))

    const regionOpts: SearchOption[] = role === 'rep' ? [] : regions
      .filter((r: any) => !kw || (r.name || '').toLowerCase().includes(kw))
      .slice(0, 6)
      .map((r: any) => ({
        key: `r-${r.id}`,
        value: r.name,
        type: 'region' as const,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <EnvironmentOutlined style={{ color: '#38BDF8', fontSize: 12 }} />
            <span style={{ color: T.textPrimary, fontSize: 12 }}>{r.name}</span>
          </div>
        ),
      }))

    const groups: { label: React.ReactNode; options: SearchOption[] }[] = []
    if (contractOpts.length > 0) groups.push({ label: '合同', options: contractOpts })
    if (regionOpts.length > 0) groups.push({ label: '区域', options: regionOpts })
    if (groups.length === 0 && kw) {
      groups.push({
        label: '无匹配结果',
        options: [{ key: 'empty', value: '', type: 'contract', label: <span style={{ color: T.textMuted, fontSize: 12 }}>未找到「{input}」相关合同或区域，回车搜索合同</span> }],
      })
    }
    return groups
  }, [contracts, regions, kw, input])

  const handleSelect = (_value: string, option: any) => {
    const opt = option as SearchOption
    setInput('')
    if (opt.type === 'contract') {
      navigate(`/contracts?q=${encodeURIComponent(opt.value)}`)
    } else {
      navigate(`/regions?q=${encodeURIComponent(opt.value)}`)
    }
  }

  const handleSearch = (value: string) => {
    const v = value.trim()
    if (!v) return
    setInput('')
    navigate(`/contracts?q=${encodeURIComponent(v)}`)
  }

  return (
    <AutoComplete
      style={{ width: 240 }}
      value={input}
      onChange={setInput}
      onSelect={handleSelect}
      onSearch={handleSearch}
      options={options}
      popupMatchSelectWidth={300}
      notFoundContent={null}
    >
      <Input
        ref={inputRef}
        size="small"
        allowClear
        placeholder="全局搜索 · Ctrl+K"
        prefix={<SearchOutlined style={{ color: T.textMuted }} />}
        style={{ background: T.bgRoot, borderColor: T.border, color: T.textPrimary }}
      />
    </AutoComplete>
  )
}

export default GlobalSearch
