import { ipcMain } from 'electron'
import { net } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'

const STOCK_API = 'https://106.54.26.86'

interface StockQuote {
  symbol: string
  name: string
  price: number
  change: number
  changePct: number
}

interface MarketSnapshot {
  round: number
  state: string
  stocks: StockQuote[]
}

async function fetchMarket(): Promise<MarketSnapshot | null> {
  try {
    const res = await net.fetch(`${STOCK_API}/market`)
    if (!res.ok) return null
    return (await res.json()) as MarketSnapshot
  } catch {
    return null
  }
}

export function registerStockQuoteHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.STOCK_GET_MARKET, async () => {
    const data = await fetchMarket()
    return { success: true, data }
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_GET_QUOTE, async (_e, symbol: string) => {
    const market = await fetchMarket()
    if (!market) return { success: false, message: '无法获取行情' }
    const stock = market.stocks.find((s) => s.symbol === symbol.toUpperCase())
    return { success: true, data: stock || null }
  })
}
