import { format } from 'date-fns'
import { Radio } from 'lucide-react'
import clsx from 'clsx'
import { useLiveAnalysis } from '../hooks/useApi'
import CycleTimeline from '../components/live/CycleTimeline'
import BTCAnalysisChart from '../components/live/BTCAnalysisChart'
import KalshiMarketCard from '../components/live/KalshiMarketCard'
import PredictionCard from '../components/live/PredictionCard'
import MempoolCard from '../components/live/MempoolCard'
import TradeCard from '../components/live/TradeCard'

export default function LiveAnalysis() {
  const { data, isLoading, error, dataUpdatedAt } = useLiveAnalysis()

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
        <p className="text-netflix-red font-semibold">Failed to load live analysis</p>
      </div>
    )
  }

  if (!data.has_active_cycle) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Live Analysis</h1>
        <div className="card text-center py-16">
          <Radio size={32} className="text-netflix-dim mx-auto mb-3" />
          <p className="text-netflix-muted font-semibold">No active cycle</p>
          <p className="text-netflix-dim text-sm mt-1">
            Next cycle fires at :00, :15, :30, or :45 past the hour (UTC)
          </p>
        </div>
      </div>
    )
  }

  const latest = data.btc_snapshots.length > 0 ? data.btc_snapshots[data.btc_snapshots.length - 1] : null
  const elapsed = data.elapsed_seconds ?? 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Live Analysis</h1>
          {data.is_live ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-netflix-green">
              <span className="w-2 h-2 rounded-full bg-netflix-green animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className="text-xs text-netflix-muted font-medium">Last cycle</span>
          )}
        </div>
        <div className="text-right text-xs text-netflix-dim">
          <p className="font-mono">{data.market_ticker}</p>
          {data.cycle_start && (
            <p>Started {format(new Date(data.cycle_start), 'HH:mm:ss')} UTC</p>
          )}
          <p>Updated {format(new Date(dataUpdatedAt), 'HH:mm:ss')}</p>
        </div>
      </div>

      {/* Timeline */}
      {data.elapsed_seconds != null && (
        <CycleTimeline
          elapsed={elapsed}
          phase={data.phase}
          config={data.cycle_config}
        />
      )}

      {/* Trade card — shown when in trade window or after */}
      {(data.trade || data.phase === 'trading' || data.phase === 'resolving') && (
        <TradeCard trade={data.trade} phase={data.phase} />
      )}

      {/* Main charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* BTC chart takes 2/3 width */}
        <div className="lg:col-span-2">
          <BTCAnalysisChart snapshots={data.btc_snapshots} targetPrice={data.target_price} />
        </div>

        {/* Kalshi market */}
        <KalshiMarketCard market={data.market_state} config={data.cycle_config} />
      </div>

      {/* Prediction + Mempool row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <PredictionCard
            prediction={data.prediction}
            phase={data.phase}
            config={data.cycle_config}
          />
        </div>
        <MempoolCard snapshots={data.btc_snapshots} />
      </div>

      {/* BTC snapshot data table */}
      {data.btc_snapshots.length > 0 && (
        <div className="card overflow-x-auto">
          <h3 className="font-semibold text-sm mb-3">BTC Snapshots</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-netflix-muted border-b border-netflix-border text-left">
                <th className="py-2 pr-3 font-medium">Min</th>
                <th className="py-2 pr-3 font-medium">Time</th>
                <th className="py-2 pr-3 font-medium text-right">Price</th>
                <th className="py-2 pr-3 font-medium text-right">Δ1m</th>
                <th className="py-2 pr-3 font-medium text-right">Δ5m</th>
                <th className="py-2 pr-3 font-medium text-right">Δ10m</th>
                <th className="py-2 pr-3 font-medium text-right">Momentum</th>
                <th className="py-2 font-medium text-right">Fee (sat/vB)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-netflix-border/30">
              {[...data.btc_snapshots].reverse().map((s) => (
                <tr key={s.minute} className="hover:bg-netflix-card/40">
                  <td className="py-2 pr-3 font-mono">{s.minute}</td>
                  <td className="py-2 pr-3 text-netflix-muted font-mono">
                    {format(new Date(s.captured_at), 'HH:mm:ss')}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium">
                    ${s.price_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  {[s.price_change_1m, s.price_change_5m, s.price_change_10m].map((v, i) => (
                    <td
                      key={i}
                      className={clsx(
                        'py-2 pr-3 text-right font-mono',
                        v == null ? 'text-netflix-dim' : v > 0 ? 'text-netflix-green' : v < 0 ? 'text-netflix-red' : 'text-netflix-muted',
                      )}
                    >
                      {v != null ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(3)}%` : '—'}
                    </td>
                  ))}
                  <td
                    className={clsx(
                      'py-2 pr-3 text-right font-mono font-semibold',
                      s.momentum_score == null ? 'text-netflix-dim'
                        : s.momentum_score > 0.1 ? 'text-netflix-green'
                        : s.momentum_score < -0.1 ? 'text-netflix-red'
                        : 'text-netflix-muted',
                    )}
                  >
                    {s.momentum_score != null ? `${s.momentum_score >= 0 ? '+' : ''}${s.momentum_score.toFixed(3)}` : '—'}
                  </td>
                  <td className="py-2 text-right text-netflix-muted">
                    {s.mempool_fee_fastest ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
