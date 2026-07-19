import { createContext, useContext, useState } from 'react'

export interface SeriesInfo {
  ticker: string
  label: string
  coinId: string
}

export const SERIES_LIST: SeriesInfo[] = [
  { ticker: 'KXBTC15M', label: 'BTC', coinId: 'bitcoin' },
  { ticker: 'KXETH15M', label: 'ETH', coinId: 'ethereum' },
  { ticker: 'KXSOL15M', label: 'SOL', coinId: 'solana' },
  { ticker: 'KXXRP15M', label: 'XRP', coinId: 'ripple' },
  { ticker: 'KXDOGE15M', label: 'DOGE', coinId: 'dogecoin' },
  { ticker: 'KXHYPE15M', label: 'HYPE', coinId: 'hyperliquid' },
  { ticker: 'KXBNB15M', label: 'BNB', coinId: 'binancecoin' },
]

interface SeriesContextValue {
  series: string
  setSeries: (v: string) => void
  seriesInfo: SeriesInfo
}

const SeriesContext = createContext<SeriesContextValue>({
  series: 'KXBTC15M',
  setSeries: () => {},
  seriesInfo: SERIES_LIST[0],
})

export function SeriesProvider({ children }: { children: React.ReactNode }) {
  const [series, setSeriesState] = useState<string>(() => {
    return localStorage.getItem('kalshi_series') ?? 'KXBTC15M'
  })

  function setSeries(v: string) {
    setSeriesState(v)
    localStorage.setItem('kalshi_series', v)
  }

  const seriesInfo = SERIES_LIST.find(s => s.ticker === series) ?? SERIES_LIST[0]

  return (
    <SeriesContext.Provider value={{ series, setSeries, seriesInfo }}>
      {children}
    </SeriesContext.Provider>
  )
}

export function useSeriesContext() {
  return useContext(SeriesContext)
}
