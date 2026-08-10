/**
 * Gipfel 统一格式化工具
 * 金额千分位、日期格式、百分比保留2位、正负色系统
 */

import dayjs from 'dayjs'

// ══════════════════════════════════════════
// 正负色系统（A股习惯：涨绿跌红）
// ══════════════════════════════════════════
export const POSITIVE_COLOR = '#22C55E'
export const NEGATIVE_COLOR = '#EF4444'

/** 根据数值正负返回颜色 */
export function getColorBySign(value: number): string {
  return value >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR
}

// ══════════════════════════════════════════
// 金额格式化
// ══════════════════════════════════════════

/** 金额千分位格式化 (数字) */
export function formatMoney(value: number | null | undefined): string {
  if (value == null) return '-'
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/** 金额千分位格式化 (带¥符号) */
export function formatMoneyCNY(value: number | null | undefined): string {
  if (value == null) return '-'
  if (value < 0) return '-¥' + Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return '¥' + value.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/** 数字千分位 */
export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '-'
  return value.toLocaleString('zh-CN')
}

// ══════════════════════════════════════════
// 日期格式化
// ══════════════════════════════════════════

/** 日期格式化 YYYY-MM-DD */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const d = dayjs(value)
  return d.isValid() ? d.format('YYYY-MM-DD') : '-'
}

/** 日期时间格式化 YYYY-MM-DD HH:mm */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const d = dayjs(value)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : '-'
}

// ══════════════════════════════════════════
// 百分比格式化
// ══════════════════════════════════════════

/** 百分比 (value 是 0-1 的小数，如 0.035) */
export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '-'
  return (value * 100).toFixed(2) + '%'
}

/** 百分比 (value 已经是百分比数值，如 3.5) */
export function formatPercentDirect(value: number | null | undefined): string {
  if (value == null) return '-'
  return value.toFixed(2) + '%'
}

/** 百分比带正负号: +2.43% / -1.18% / 0.00% */
export function formatPercentWithSign(value: number | null | undefined): string {
  if (value == null) return '-'
  const sign = value >= 0 ? '+' : ''
  return sign + value.toFixed(2) + '%'
}

/** 百分比带正负号 (value 是 0-1 的小数) */
export function formatPercentWithSignFromRatio(value: number | null | undefined): string {
  if (value == null) return '-'
  return formatPercentWithSign(value * 100)
}

// ══════════════════════════════════════════
// 趋势指示
// ══════════════════════════════════════════

/** 涨跌箭头: ▲ 涨 / ▼ 跌 / - 平 */
export function formatTrend(value: number | null | undefined): string {
  if (value == null) return '-'
  if (value > 0) return '▲'
  if (value < 0) return '▼'
  return '-'
}

/** 涨跌箭头 + 数值: ▲ +12.50 / ▼ -3.20 */
export function formatTrendWithValue(value: number | null | undefined, suffix: string = ''): string {
  if (value == null) return '-'
  const arrow = formatTrend(value)
  const absValue = Math.abs(value).toFixed(2)
  const sign = value >= 0 ? '+' : '-'
  return `${arrow} ${sign}${absValue}${suffix}`
}
