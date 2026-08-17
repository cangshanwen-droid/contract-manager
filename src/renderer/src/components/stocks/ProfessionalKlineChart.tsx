import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Empty, Spin } from 'antd'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  LineSeries,
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts'

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

type RangeMode = 'all' | '10' | '30'

const BASE_TIME = 946684800
const DAY_SECONDS = 86400
const upColor = '#F24957'
const downColor = '#2CB67D'
const flatColor = '#8A9BB5'

function priceLabel(value: number) {
  if (!Number.isFinite(value)) return '--'
  return value >= 1000 ? value.toFixed(1) : value.toFixed(2)
}

function roundLabel(round: number) {
  return `第 ${round} 轮`
}

function roundToTime(round: number): UTCTimestamp {
  return (BASE_TIME + Math.max(1, round) * DAY_SECONDS) as UTCTimestamp
}

function timeToRound(time: unknown): number | null {
  if (typeof time !== 'number') return null
  return Math.max(1, Math.round((time - BASE_TIME) / DAY_SECONDS))
}

function movingAverage(candles: TradingCandle[], period: number) {
  return candles.map((candle, index) => {
    const window = candles.slice(Math.max(0, index - period + 1), index + 1)
    const value = window.reduce((sum, item) => sum + Number(item.close), 0) / window.length
    return { time: roundToTime(candle.round), value: Number(value.toFixed(2)) }
  })
}

export function ProfessionalKlineChart({ candles, loading = false, symbol }: Props) {
  const chartElementRef = useRef<HTMLDivElement>(null)
  const chartApiRef = useRef<IChartApi | null>(null)
  const [active, setActive] = useState<TradingCandle | null>(null)
  const [tooltip, setTooltip] = useState<{ candle: TradingCandle; x: number; y: number } | null>(null)
  const [range, setRange] = useState<RangeMode>('all')

  const safeCandles = useMemo(() => candles
    .filter((item) => [item.open, item.high, item.low, item.close].every(Number.isFinite))
    .sort((a, b) => a.round - b.round)
    .slice(-120), [candles])

  useEffect(() => {
    setActive(safeCandles[safeCandles.length - 1] ?? null)
  }, [safeCandles])

  useEffect(() => {
    const element = chartElementRef.current
    if (!element || !safeCandles.length) return

    const formatRound = (time: unknown) => {
      const round = timeToRound(time)
      return round ? `第${round}轮` : ''
    }
    const chart = createChart(element, {
      width: Math.max(320, element.clientWidth),
      height: Math.max(360, element.clientHeight),
      layout: {
        background: { type: ColorType.Solid, color: '#0F141E' },
        textColor: '#AEB9CA',
        fontFamily: 'JetBrains Mono, Consolas, Cascadia Code, monospace',
        fontSize: 11,
        attributionLogo: false,
      },
      localization: { priceFormatter: priceLabel, timeFormatter: formatRound },
      grid: {
        vertLines: { color: '#232B3B', style: LineStyle.Dashed, visible: false },
        horzLines: { color: '#232B3B', style: LineStyle.Dashed, visible: true },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(226,232,240,.26)', width: 1, style: LineStyle.LargeDashed, labelBackgroundColor: '#334155' },
        horzLine: { color: 'rgba(226,232,240,.26)', width: 1, style: LineStyle.LargeDashed, labelBackgroundColor: '#334155' },
      },
      rightPriceScale: {
        borderColor: 'rgba(99,116,139,.42)',
        scaleMargins: { top: 0.08, bottom: 0.3 },
        minimumWidth: 72,
      },
      timeScale: {
        borderColor: 'rgba(99,116,139,.42)',
        rightOffset: safeCandles.length <= 18 ? 10 : 6,
        barSpacing: safeCandles.length <= 18 ? 7 : 6,
        minBarSpacing: 6,
        fixLeftEdge: true,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: formatRound,
      },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    })
    chartApiRef.current = chart

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor,
      downColor,
      borderUpColor: upColor,
      borderDownColor: downColor,
      wickUpColor: upColor,
      wickDownColor: downColor,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    })
    candleSeries.setData(safeCandles.map((item) => ({
      time: roundToTime(item.round),
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    })))

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    })
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.72, bottom: 0.02 } })
    volumeSeries.setData(safeCandles.map((item) => ({
      time: roundToTime(item.round),
      value: Math.max(0.01, Number(item.volume) || 0),
      color: item.close >= item.open ? 'rgba(242,73,87,.55)' : 'rgba(44,182,125,.50)',
    })))

    const ma5Data = movingAverage(safeCandles, 5)
    const ma10Data = movingAverage(safeCandles, 10)
    const ma5 = chart.addSeries(LineSeries, { color: '#FFC107', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    ma5.setData(ma5Data.map((point, index) => ({ ...point, color: ma10Data[index] && point.value < ma10Data[index].value ? '#F59E0B' : '#FFC107' })))
    const ma10 = chart.addSeries(LineSeries, { color: '#0EA5E9', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    ma10.setData(ma10Data)
    const volumeMa = chart.addSeries(LineSeries, { color: 'rgba(210,218,230,.55)', lineWidth: 1, priceScaleId: 'volume', priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    volumeMa.setData(safeCandles.map((candle, index) => {
      const window = safeCandles.slice(Math.max(0, index - 4), index + 1)
      return { time: roundToTime(candle.round), value: window.reduce((sum, item) => sum + Number(item.volume || 0), 0) / window.length }
    }))

    const latest = safeCandles[safeCandles.length - 1]
    candleSeries.createPriceLine({ price: latest.close, color: '#FFFFFF', lineWidth: 2, lineStyle: LineStyle.LargeDashed, axisLabelVisible: true, title: '' })
    const resistancePrice = Math.max(...safeCandles.map((item) => Math.max(item.high, item.close)))
    if (resistancePrice > latest.close) {
      candleSeries.createPriceLine({ price: resistancePrice, color: 'rgba(240,245,255,.72)', lineWidth: 2, lineStyle: LineStyle.LargeDashed, axisLabelVisible: true, title: '压力' })
    }

    chart.subscribeCrosshairMove((param) => {
      const round = timeToRound(param.time)
      if (!round || !param.point) { setTooltip(null); return }
      const candle = safeCandles.find((item) => item.round === round)
      if (candle) {
        setActive(candle)
        const tipWidth = 194
        const x = param.point.x + tipWidth + 24 > element.clientWidth ? param.point.x - tipWidth - 14 : param.point.x + 14
        const y = Math.max(52, Math.min(param.point.y - 36, element.clientHeight - 230))
        setTooltip({ candle, x: Math.max(10, x), y })
      }
    })

    const observer = new ResizeObserver(([entry]) => {
      chart.applyOptions({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(360, Math.floor(entry.contentRect.height)),
      })
    })
    observer.observe(element)
    if (safeCandles.length <= 18) {
      chart.timeScale().setVisibleLogicalRange({ from: -1, to: Math.max(28, safeCandles.length + 8) })
    } else {
      chart.timeScale().fitContent()
    }

    return () => {
      observer.disconnect()
      chartApiRef.current = null
      chart.remove()
    }
  }, [safeCandles])

  useEffect(() => {
    const chart = chartApiRef.current
    if (!chart || !safeCandles.length) return
    if (range === 'all') {
      if (safeCandles.length <= 18) {
        chart.timeScale().setVisibleLogicalRange({ from: -1, to: Math.max(28, safeCandles.length + 8) })
      } else {
        chart.timeScale().fitContent()
      }
      return
    }
    const count = Math.min(Number(range), safeCandles.length)
    chart.timeScale().setVisibleLogicalRange({ from: safeCandles.length - count - 0.5, to: safeCandles.length + 0.5 })
  }, [range, safeCandles])

  if (loading) {
    return <div className="trading-chart-state"><Spin size="small" /><span>K 线数据加载中</span></div>
  }
  if (!safeCandles.length) {
    return <div className="trading-chart-state"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无成交数据，首笔成交后生成 K 线" /></div>
  }

  const activeCandle = active ?? safeCandles[safeCandles.length - 1]
  const activeColor = activeCandle.close > activeCandle.open ? upColor : activeCandle.close < activeCandle.open ? downColor : flatColor
  const ma5Latest = movingAverage(safeCandles, 5).at(-1)?.value
  const ma10Latest = movingAverage(safeCandles, 10).at(-1)?.value

  return (
    <div className="trading-kline">
      <div className="trading-kline__toolbar">
        <div className="trading-kline__readout" aria-live="polite">
          <span className="trading-kline__symbol">{symbol}</span>
          <span>开 <b>{priceLabel(activeCandle.open)}</b></span>
          <span>高 <b className="is-up">{priceLabel(activeCandle.high)}</b></span>
          <span>低 <b className="is-down">{priceLabel(activeCandle.low)}</b></span>
          <span>收 <b style={{ color: activeColor }}>{priceLabel(activeCandle.close)}</b></span>
          <span>量 <b>{Number(activeCandle.volume || 0).toLocaleString('zh-CN')}</b></span>
          <span className="is-ma5">MA5 <b>{priceLabel(ma5Latest ?? 0)}</b></span>
          <span className="is-ma10">MA10 <b>{priceLabel(ma10Latest ?? 0)}</b></span>
          <span className="trading-kline__time">{roundLabel(activeCandle.round)}</span>
        </div>
        <div className="trading-kline__ranges" role="group" aria-label="K 线显示范围">
          {([['10', '10轮', '近 10 轮'], ['30', '30轮', '近 30 轮'], ['all', '全部', '全部轮次']] as const).map(([value, label, accessibleLabel]) => (
            <button key={value} className={range === value ? 'is-active' : ''} aria-label={accessibleLabel} aria-pressed={range === value} onClick={() => setRange(value)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="trading-kline__stage">
        <div className="trading-kline__plot" ref={chartElementRef} role="img" aria-label={`${symbol} 轮次蜡烛图，可使用滚轮缩放并拖动平移`} />
        {tooltip && <div className="trading-kline__tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <strong>第 {tooltip.candle.round} 轮</strong>
          <span>开盘<b>¥{priceLabel(tooltip.candle.open)}</b></span>
          <span>最高<b>¥{priceLabel(tooltip.candle.high)}</b></span>
          <span>最低<b>¥{priceLabel(tooltip.candle.low)}</b></span>
          <span>收盘<b>¥{priceLabel(tooltip.candle.close)}</b></span>
          <span>涨跌<b style={{ color: tooltip.candle.close >= tooltip.candle.open ? upColor : downColor }}>{tooltip.candle.close >= tooltip.candle.open ? '+' : ''}{priceLabel(tooltip.candle.close - tooltip.candle.open)}</b></span>
          <span>成交量<b>{tooltip.candle.volume.toLocaleString('zh-CN')}</b></span>
        </div>}
      </div>
      <div className="trading-kline__footer">
        <span>{safeCandles.length < 5 ? `已生成 ${safeCandles.length} 轮，满 5 轮显示 MA5` : '滚轮缩放 · 拖动平移 · 十字光标查看 OHLC'}</span>
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">图表技术由 TradingView 提供</a>
      </div>
      <table className="trading-kline__accessible-table">
        <caption>{symbol} 轮次 OHLC 数据</caption>
        <thead><tr><th>轮次</th><th>开盘</th><th>最高</th><th>最低</th><th>收盘</th><th>成交量</th></tr></thead>
        <tbody>{safeCandles.map((item) => <tr key={item.round}><td>{item.round}</td><td>{item.open}</td><td>{item.high}</td><td>{item.low}</td><td>{item.close}</td><td>{item.volume}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

export default ProfessionalKlineChart
