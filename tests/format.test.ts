/**
 * 格式化纯函数单测（renderer/utils/format.ts）
 * 金额千分位 / 日期 / 百分比 / 涨跌指示 / 正负色
 */
import { describe, expect, it } from 'vitest'
import {
  POSITIVE_COLOR,
  NEGATIVE_COLOR,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyCNY,
  formatNumber,
  formatPercent,
  formatPercentDirect,
  formatPercentWithSign,
  formatPercentWithSignFromRatio,
  formatTrend,
  formatTrendWithValue,
  getColorBySign
} from '../src/renderer/src/utils/format'

describe('金额格式化', () => {
  it('formatMoney：千分位 + 最多2位小数', () => {
    expect(formatMoney(1234567.5)).toBe('1,234,567.5')
    expect(formatMoney(0)).toBe('0')
    expect(formatMoney(999.99)).toBe('999.99')
    expect(formatMoney(-1234)).toBe('-1,234')
  })

  it('formatMoney：null/undefined 返回占位符 —', () => {
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(undefined)).toBe('—')
  })

  it('formatMoneyCNY：正数带 ¥，负数 -¥，零为 ¥0', () => {
    expect(formatMoneyCNY(1234.5)).toBe('¥1,234.5')
    expect(formatMoneyCNY(-1234.5)).toBe('-¥1,234.5')
    expect(formatMoneyCNY(0)).toBe('¥0')
    expect(formatMoneyCNY(null)).toBe('—')
  })

  it('formatNumber：纯千分位', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(formatNumber(null)).toBe('—')
  })
})

describe('日期格式化', () => {
  it('formatDate：YYYY-MM-DD', () => {
    expect(formatDate('2026-08-10T10:30:00')).toBe('2026-08-10')
    expect(formatDate('2026-08-10')).toBe('2026-08-10')
  })

  it('formatDateTime：YYYY-MM-DD HH:mm', () => {
    expect(formatDateTime('2026-08-10T10:30:00')).toBe('2026-08-10 10:30')
  })

  it('空值/非法日期返回 —', () => {
    expect(formatDate('')).toBe('—')
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('not-a-date')).toBe('—')
    expect(formatDateTime('not-a-date')).toBe('—')
  })
})

describe('百分比格式化', () => {
  it('formatPercent：0-1 小数 → 百分比（2位小数）', () => {
    expect(formatPercent(0.035)).toBe('3.50%')
    expect(formatPercent(1)).toBe('100.00%')
    expect(formatPercent(null)).toBe('—')
  })

  it('formatPercentDirect：已是百分比数值', () => {
    expect(formatPercentDirect(3.5)).toBe('3.50%')
    expect(formatPercentDirect(0)).toBe('0.00%')
  })

  it('formatPercentWithSign：带正负号', () => {
    expect(formatPercentWithSign(2.43)).toBe('+2.43%')
    expect(formatPercentWithSign(-1.18)).toBe('-1.18%')
    expect(formatPercentWithSign(0)).toBe('+0.00%')
  })

  it('formatPercentWithSignFromRatio：小数 ×100 后带符号', () => {
    expect(formatPercentWithSignFromRatio(0.0243)).toBe('+2.43%')
    expect(formatPercentWithSignFromRatio(-0.0118)).toBe('-1.18%')
  })
})

describe('趋势指示与正负色', () => {
  it('formatTrend：涨▲ 跌▼ 平—', () => {
    expect(formatTrend(1)).toBe('▲')
    expect(formatTrend(-1)).toBe('▼')
    expect(formatTrend(0)).toBe('—')
    expect(formatTrend(null)).toBe('—')
  })

  it('formatTrendWithValue：箭头 + 符号数值', () => {
    expect(formatTrendWithValue(12.5)).toBe('▲ +12.50')
    expect(formatTrendWithValue(-3.2)).toBe('▼ -3.20')
    expect(formatTrendWithValue(0)).toBe('— +0.00')
    expect(formatTrendWithValue(8.888, '%')).toBe('▲ +8.89%')
  })

  it('getColorBySign：非负绿、负红（A股习惯）', () => {
    expect(getColorBySign(1)).toBe(POSITIVE_COLOR)
    expect(getColorBySign(0)).toBe(POSITIVE_COLOR)
    expect(getColorBySign(-1)).toBe(NEGATIVE_COLOR)
  })
})
