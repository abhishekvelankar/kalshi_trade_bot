import { useDashboard, useTrades } from '../hooks/useApi'
import HeroCard from '../components/dashboard/HeroCard'
import StatsRow from '../components/dashboard/StatsRow'
import RecentCyclesTable from '../components/dashboard/RecentCyclesTable'
import PnLChart from '../components/charts/PnLChart'

export default function Dashboard() {
  const { data, isLoading, error } = useDashboard()
  const { data: trades } = useTrades({ limit: 50 })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-2 border-netflix-red border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="card text-center py-12">
        <p className="text-netflix-red font-semibold">Failed to connect to bot API</p>
        <p className="text-netflix-dim text-sm mt-1">Make sure the backend is running</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <HeroCard cycle={data.active_cycle} serverTime={data.server_time} />

      <StatsRow
        wins={data.wins}
        losses={data.losses}
        winRate={data.win_rate}
        totalPnl={data.total_pnl}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PnLChart trades={trades ?? []} />

        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Active Config</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Mode', data.config.paper_trade ? '🟡 Paper Trade' : '🔴 Live Trade'],
              ['Trade Amount', `$${data.config.trade_amount}`],
              ['YES Threshold', `${(data.config.yes_threshold * 100).toFixed(0)}%`],
              ['NO Threshold', `${(data.config.no_threshold * 100).toFixed(0)}%`],
              ['Min Confidence', `${(data.config.min_confidence * 100).toFixed(0)}%`],
              ['Kalshi Weight', `${(data.config.kalshi_weight * 100).toFixed(0)}%`],
            ].map(([label, val]) => (
              <div key={label} className="bg-netflix-card rounded-lg px-3 py-2">
                <p className="text-netflix-dim text-xs mb-0.5">{label}</p>
                <p className="font-semibold text-netflix-text">{val}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <RecentCyclesTable cycles={data.recent_cycles} />
    </div>
  )
}
