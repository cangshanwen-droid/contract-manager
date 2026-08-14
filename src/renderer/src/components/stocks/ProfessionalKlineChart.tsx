import React, { useEffect, useMemo, useRef, useState } from 'react'
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

const LEFT = 18
const RIGHT = 82
const DEFAULT_WIDTH = 1000
const DEFAULT_HEIGHT = 520

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
  const plotRef = useRef<HTMLDivElement>(null)
  const [plotSize, setPlotSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })

  useEffect(() => {
    const element = plotRef.current
    if (!element) return
    const update = () => {
      const bounds = element.getBoundingClientRect()
      setPlotSize({
        width: Math.max(360, Math.round(bounds.width)),
        height: Math.max(340, Math.round(bounds.height)),
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const chart = useMemo(() => {
    if (!candles.length) return null
    const visible = candles.slice(-72)
    const width = plotSize.width
    const height = plotSize.height
    const priceTop = 22
    const priceBottom = height - 132
    const volumeTop = height - 104
    const volumeBottom = height - 38
    const plotRight = width - RIGHT
    const plotWidth = plotRight - LEFT
    const high = Math.max(...visible.map((item) => Number(item.high)))
    const low = Math.min(...visible.map((item) => Number(item.low)))
    const sparse = visible.length < 4
    const referencePrice = Math.max(Math.abs(high), Math.abs(low), 1)
    const expandedSparseScale = sparse && (high - low) < referencePrice * 0.02
    const rawRange = Math.max(high - low, referencePrice * (expandedSparseScale ? 0.05 : 0.018), 0.1)
    const padding = expandedSparseScale ? 0.48 : 0.08
    const upper = high + rawRange * padding
    const lower = Math.max(0, low - rawRange * padding)
    const range = Math.max(upper - lower, 0.01)
    const maxVolume = Math.max(...visible.map((item) => Number(item.volume) || 0), 1)
    const step = plotWidth / visible.length
    const bodyWidth = Math.max(3, Math.min(11, step * 0.58))
    const y = (price: number) => priceTop + ((upper - price) / range) * (priceBottom - priceTop)
    const volumeY = (volume: number) => volumeBottom - (Math.max(0, volume) / maxVolume) * (volumeBottom - volumeTop)
    const priceTicks = Array.from({ length: 6 }, (_, index) => upper - (range * index) / 5)
    const timeTickIndexes = Array.from(new Set([0, Math.floor((visible.length - 1) * 0.25), Math.floor((visible.length - 1) * 0.5), Math.floor((visible.length - 1) * 0.75), visible.length - 1]))
    const highestIndex = visible.findIndex((item) => item.high === high)
    const lowestIndex = visible.findIndex((item) => item.low === low)
    return { visible, width, height, priceTop, priceBottom, volumeTop, volumeBottom, plotRight, high, low, upper, lower, maxVolume, step, bodyWidth, y, volumeY, priceTicks, timeTickIndexes, highestIndex, lowestIndex, sparse }
  }, [candles, plotSize])

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
    const x = ((event.clientX - bounds.left) / bounds.width) * chart.width
    if (x < LEFT || x > chart.plotRight) {
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
        {chart.sparse && <span className="trading-kline__sample">样本 {chart.visible.length}/4 · 趋势仅供参考</span>}
        <span className="trading-kline__time">{timeLabel(active.time, active.round)}</span>
      </div>

      <div className="trading-kline__plot" ref={plotRef}>
        <svg
          className="trading-kline__canvas"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          role="img"
          aria-label={`${symbol} 蜡烛图，红色上涨、绿色下跌，下方为成交量`}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoveredIndex(null)}
        >
        <rect x="0" y="0" width={chart.width} height={chart.height} fill="#07182E" />

        <text x={LEFT} y={chart.priceTop + 2} className="trading-kline__axis-title">价格（元）</text>

        {chart.priceTicks.map((tick, index) => {
          const y = chart.priceTop + ((chart.priceBottom - chart.priceTop) * index) / 5
          return (
            <g key={tick}>
              <line x1={LEFT} x2={chart.plotRight} y1={y} y2={y} className="trading-kline__grid" />
              <text x={chart.plotRight + 12} y={y + 4} className="trading-kline__axis-label">{priceLabel(tick)}</text>
            </g>
          )
        })}

        {chart.timeTickIndexes.map((index) => {
          const x = LEFT + chart.step * index + chart.step / 2
          const candle = chart.visible[index]
          return (
            <g key={`${candle.time}-${index}`}>
              <line x1={x} x2={x} y1={chart.priceTop} y2={chart.volumeBottom} className="trading-kline__grid is-vertical" />
              <text x={x} y={chart.height - 12} textAnchor={index === 0 ? 'start' : index === chart.visible.length - 1 ? 'end' : 'middle'} className="trading-kline__axis-label">
                {timeLabel(candle.time, candle.round)}
              </text>
            </g>
          )
        })}

        <line x1={LEFT} x2={chart.plotRight} y1={chart.volumeTop - 10} y2={chart.volumeTop - 10} className="trading-kline__divider" />
        <text x={LEFT} y={chart.volumeTop} className="trading-kline__section-label">成交量（股）</text>
        <text x={chart.plotRight + 12} y={chart.volumeTop + 4} className="trading-kline__axis-label">{chart.maxVolume.toLocaleString('zh-CN')}</text>
        <text x={chart.plotRight + 12} y={chart.volumeBottom + 4} className="trading-kline__axis-label">0</text>

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
                height={Math.max(1, chart.volumeBottom - volumeY)}
                fill={color}
                opacity="0.52"
              />
              {chart.sparse && (
                <text x={x} y={chart.volumeBottom + 18} textAnchor="middle" className="trading-kline__round-label">
                  第 {candle.round} 轮
                </text>
              )}
            </g>
          )
        })}

        <line x1={LEFT} x2={chart.plotRight} y1={latestY} y2={latestY} className="trading-kline__last-line" />
        <rect x={chart.plotRight + 5} y={latestY - 11} width={RIGHT - 10} height="22" className="trading-kline__last-label-bg" />
        <text x={chart.plotRight + 12} y={latestY + 4} className="trading-kline__last-label">{priceLabel(latest.close)}</text>

        {chart.highestIndex >= 0 && (() => {
          const x = LEFT + chart.step * chart.highestIndex + chart.step / 2
          const y = chart.y(chart.high)
          const placeLeft = x > chart.plotRight - 100
          return <g><line x1={placeLeft ? x - 34 : x} x2={placeLeft ? x : x + 34} y1={y} y2={y} className="trading-kline__extreme-line" /><text x={placeLeft ? x - 38 : x + 38} y={y - 6} textAnchor={placeLeft ? 'end' : 'start'} className="trading-kline__extreme-label is-high">最高 {priceLabel(chart.high)}</text></g>
        })()}
        {chart.lowestIndex >= 0 && (() => {
          const x = LEFT + chart.step * chart.lowestIndex + chart.step / 2
          const y = chart.y(chart.low)
          const placeRight = x < LEFT + 100
          return <g><line x1={placeRight ? x : x - 34} x2={placeRight ? x + 34 : x} y1={y} y2={y} className="trading-kline__extreme-line" /><text x={placeRight ? x + 38 : x - 38} y={y + 14} textAnchor={placeRight ? 'start' : 'end'} className="trading-kline__extreme-label is-low">最低 {priceLabel(chart.low)}</text></g>
        })()}

        {hoveredIndex !== null && (
          <g className="trading-kline__crosshair" aria-hidden="true">
            <line x1={activeX} x2={activeX} y1={chart.priceTop} y2={chart.volumeBottom} />
            <line x1={LEFT} x2={chart.plotRight} y1={activeY} y2={activeY} />
            <circle cx={activeX} cy={activeY} r="3.5" />
            <rect x={chart.plotRight + 5} y={activeY - 11} width={RIGHT - 10} height="22" />
            <text x={chart.plotRight + 12} y={activeY + 4}>{priceLabel(active.close)}</text>
            <rect x={Math.max(LEFT, Math.min(activeX - 44, chart.plotRight - 88))} y={chart.height - 27} width="88" height="20" />
            <text x={Math.max(LEFT + 44, Math.min(activeX, chart.plotRight - 44))} y={chart.height - 13} textAnchor="middle">{timeLabel(active.time, active.round)}</text>
          </g>
        )}
        </svg>
      </div>
    </div>
  )
}

export default ProfessionalKlineChart
