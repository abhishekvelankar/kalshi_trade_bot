import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { TradeModeProvider } from './context/TradeModeContext'
import { SeriesProvider } from './context/SeriesContext'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import LiveAnalysis from './pages/LiveAnalysis'
import Trades from './pages/Trades'
import Analytics from './pages/Analytics'
import Config from './pages/Config'
import CycleHistory from './pages/CycleHistory'
import CycleDetail from './pages/CycleDetail'

export default function App() {
  return (
    <SeriesProvider>
    <TradeModeProvider>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/live" element={<LiveAnalysis />} />
          <Route path="/history" element={<CycleHistory />} />
          <Route path="/history/:id" element={<CycleDetail />} />
          <Route path="/trades" element={<Trades />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/config" element={<Config />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </TradeModeProvider>
    </SeriesProvider>
  )
}
