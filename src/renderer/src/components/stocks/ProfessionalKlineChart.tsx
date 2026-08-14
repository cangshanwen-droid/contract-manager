import React, { useMemo, useState } from 'react'
import { Empty, Spin } from 'antd'

export type TradingCandle = {
  round: number
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type Props = {
  candles: TradingCandle[]
  loading?: boolean
  symbol: string
}

const WIDTH = 1000
const HEIGHT = 452
const LEFT = 18
const RIGHT = 82
const PRICE_TOP = 22
const PRICE_BOTTOM = 330
const VOLUME_TOP = 354
const VOLUME_BOTTOM = 414
const PLOT_RIGHT = WIDTH - RIGHT
const PLOT_WIDTH = PLOT_RIGHT - LEFT

const upColor = '#E74C3C'
const downColor = '#2ECC71'
const flatColor = '#8A9BB5'

function priceLabel(value: number) {
  if (!Number.isFinite(value)) return '--'
  return value >= 1000 ? value.toFixed(1) : value.toFixed(2)
}

function timeLabel(value: string, round: number) {
  if (!value) return `第 ${round} 轮`
  const normalized = value.replace('T', ' ')
  return normalized.length >= 16 ? normalized.slice(5, 16) : normalized.slice(0, 10)
}

export function ProfessionalKlineChart({ candles, loading = false, symbol }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const chart = useMemo(() => {
    if (!candles.length) return null
    const visible = candles.slice(-72)
    const high = Math.max(...visible.map((item) => Number(item.high)))
    const low = Math.min(...visible.map((item) => Number(item.low)))
    const rawRange = Math.max(high - low, Math.abs(high) * 0.018, 0.1)
    const upper = high + rawRange * 0.08
    const lower = Math.max(0, low - rawRange * 0.08)
    const range = Math.max(upper - lower, 0.01)
    const maxVolume = Math.max(...visible.map((item) => Number(item.volume) || 0), 1)
    const step = PLOT_WIDTH / visible.length
    const bodyWidth = Math.max(3, Math.min(11, step * 0.58))
    const y = (price: number) => PRICE_TOP + ((upper - price) / range) * (PRICE_BOTTOM - PRICE_TOP)
    const volumeY = (volume: number) => VOLUME_BOTTOM - (Math.max(0, volume) / maxVolume) * (VOLUME_BOTTOM - VOLUME_TOP)
    const priceTicks = Array.from({ length: 6 }, (_, index) => upper - (range * index) / 5)
    const timeTickIndexes = Array.from(new Set([0, Math.floor((visible.length - 1) * 0.25), Math.floor((visible.length - 1) * 0.5), Math.floor((visible.length - 1) * 0.75), visible.length - 1]))
    const highestIndex = visible.findIndex((item) => item.high === high)
    const lowestIndex = visible.findIndex((item) => item.low === low)
    return { visible, high, low, upper, lower, maxVolume, step, bodyWidth, y, volumeY, priceTicks, timeTickIndexes, highestIndex, lowestIndex }
  }, [candles])

  if (loading) {
    return <div className="trading-chart-state"><Spin size="small" /><span>K 线数据加载中</span></div>
  }
  if (!chart) {
    return <div className="trading-chart-state"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无成交数据，首笔成交后生成 K 线" /></div>
  }

  const activeIndex = hoveredIndex ?? chart.visible.length - 1
  const active = chart.visible[activeIndex]
  const activeX = LEFT + chart.step * activeIndex + chart.step / 2
  const activeY = chart.y(active.close)
  const latest = chart.visible[chart.visible.length - 1]
  const latestY = chart.y(latest.close)
  const activeColor = active.close > active.open ? upColor : active.close < active.open ? downColor : flatColor

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH
    if (x < LEFT || x > PLOT_RIGHT) {
      setHoveredIndex(null)
      return
    }
    const index = Math.max(0, Math.min(chart.visible.length - 1, Math.floor((x - LEFT) / chart.step)))
    setHoveredIndex(index)
  }

  return (
    <div className="trading-kline">
      <div className="trading-kline__readout" aria-live="polite">
        <span className="trading-kline__symbol">{symbol}</span>
        <span>开 <b>{priceLabel(active.open)}</b></span>
        <span>高 <b className="is-up">{priceLabel(active.high)}</b></span>
        <span>低 <b className="is-down">{priceLabel(active.low)}</b></span>
        <span>收 <b style={{ color: activeColor }}>{priceLabel(active.close)}</b></span>
        <span>量 <b>{Number(active.volume || 0).toLocaleString('zh-CN')}</b></span>
        <span className="trading-kline__time">{timeLabel(active.time, active.round)}</span>
      </div>

      <svg
        className="trading-kline__canvas"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${symbol} 蜡烛图，红色上涨、绿色下跌，下方为成交量`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoveredIndex(null)}
      >
        <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="#07182E" />

        {chart.priceTicks.map((tick, index) => {
          const y = PRICE_TOP + ((PRICE_BOTTOM - PRICE_TOP) * index) / 5
          return (
            <g key={tick}>
              <line x1={LEFT} x2={PLOT_RIGHT} y1={y} y2={y} className="trading-kline__grid" />
              <text x={PLOT_RIGHT + 12} y={y + 4} className="trading-kline__axis-label">{priceLabel(tick)}</text>
            </g>
          )
        })}

        {chart.timeTickIndexes.map((index) => {
          const x = LEFT + chart.step * index + chart.step / 2
          const candle = chart.visible[index]
          return (
            <g key={`${candle.time}-${index}`}>
              <line x1={x} x2={x} y1={PRICE_TOP} y2={VOLUME_BOTTOM} className="trading-kline__grid is-vertical" />
              <text x={x} y={HEIGHT - 12} textAnchor={index === 0 ? 'start' : index === chart.visible.length - 1 ? 'end' : 'middle'} className="trading-kline__axis-label">
                {timeLabel(candle.time, candle.round)}
              </text>
            </g>
          )
        })}

        <line x1={LEFT} x2={PLOT_RIGHT} y1={VOLUME_TOP - 10} y2={VOLUME_TOP - 10} className="trading-kline__divider" />
        <text x={LEFT} y={VOLUME_TOP} className="trading-kline__section-label">VOL</text>

        {chart.visible.map((candle, index) => {
          const x = LEFT + chart.step * index + chart.step / 2
          const openY = chart.y(candle.open)
          const closeY = chart.y(candle.close)
          const highY = chart.y(candle.high)
          const lowY = chart.y(candle.low)
          const rising = candle.close > candle.open
          const falling = candle.close < candle.open
          const color = rising ? upColor : falling ? downColor : flatColor
          const bodyHeight = Math.max(1.6, Math.abs(openY - closeY))
          const bodyY = Math.min(openY, closeY)
          const volumeY = chart.volumeY(Number(candle.volume) || 0)
          return (
            <g key={`${candle.time}-${candle.round}-${index}`}>
              <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth="1.35" />
              <rect
                x={x - chart.bodyWidth / 2}
                y={bodyY}
                width={chart.bodyWidth}
                height={bodyHeight}
                fill={falling ? color : rising ? color : 'transparent'}
                stroke={color}
                strokeWidth="1.2"
              />
              <rect
                x={x - chart.bodyWidth / 2}
                y={volumeY}
                width={chart.bodyWidth}
                height={Math.max(1, VOLUME_BOTTOM - volumeY)}
                fill={color}
                opacity="0.52"
              />
            </g>
          )
        })}

        <line x1={LEFT} x2={PLOT_RIGHT} y1={latestY} y2={latestY} className="trading-kline__last-line" />
        <rect x={PLOT_RIGHT + 5} y={latestY - 11} width={RIGHT - 10} height="22" className="trading-kline__last-label-bg" />
        <text x={PLOT_RIGHT + 12} y={latestY + 4} className="trading-kline__last-label">{priceLabel(latest.close)}</text>

        {chart.highestIndex >= 0 && (() => {
          const x = LEFT + chart.step * chart.highestIndex + chart.step / 2
          const y = chart.y(chart.high)
          return <g><line x1={x} x2={x + 34} y1={y} y2={y} className="trading-kline__extreme-line" /><text x={x + 38} y={y + 4} className="trading-kline__extreme-label">{priceLabel(chart.high)}</text></g>
        })()}
        {chart.lowestIndex >= 0 && (() => {
          const x = LEFT + chart.step * chart.lowestIndex + chart.step / 2
          const y = chart.y(chart.low)
          return <g><line x1={x - 34} x2={x} y1={y} y2={y} className="trading-kline__extreme-line" /><text x={x - 38} y={y + 4} textAnchor="end" className="trading-kline__extreme-label">{priceLabel(chart.low)}</text></g>
        })()}

        {hoveredIndex !== null && (
          <g className="trading-kline__crosshair" aria-hidden="true">
            <line x1={activeX} x2={activeX} y1={PRICE_TOP} y2={VOLUME_BOTTOM} />
            <line x1={LEFT} x2={PLOT_RIGHT} y1={activeY} y2={activeY} />
            <circle cx={activeX} cy={activeY} r="3.5" />
            <rect x={PLOT_RIGHT + 5} y={activeY - 11} width={RIGHT - 10} height="22" />
            <text x={PLOT_RIGHT + 12} y={activeY + 4}>{priceLabel(active.close)}</text>
          </g>
        )}
      </svg>
    </div>
  )
}

export default ProfessionalKlineChart
