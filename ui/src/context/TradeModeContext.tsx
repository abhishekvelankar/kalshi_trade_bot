import { createContext, useContext, useState } from 'react'

interface TradeModeContextValue {
  isPaper: boolean
  setIsPaper: (v: boolean) => void
}

const TradeModeContext = createContext<TradeModeContextValue>({
  isPaper: true,
  setIsPaper: () => {},
})

export function TradeModeProvider({ children }: { children: React.ReactNode }) {
  const [isPaper, setIsPaperState] = useState<boolean>(() => {
    const stored = localStorage.getItem('kalshi_trade_mode')
    return stored === null ? true : stored === 'paper'
  })

  function setIsPaper(v: boolean) {
    setIsPaperState(v)
    localStorage.setItem('kalshi_trade_mode', v ? 'paper' : 'live')
  }

  return (
    <TradeModeContext.Provider value={{ isPaper, setIsPaper }}>
      {children}
    </TradeModeContext.Provider>
  )
}

export function useTradeMode() {
  return useContext(TradeModeContext)
}
