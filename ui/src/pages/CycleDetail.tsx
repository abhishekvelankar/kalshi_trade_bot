import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft } from 'lucide-react'
import clsx from 'clsx'
import { useCycleDetail } from '../hooks/useApi'
import CycleTimeline from '../components/live/CycleTimeline'
import BTCAnalysisChart from '../components/live/BTCAnalysisChart'
import KalshiMarketCard from '../components/live/KalshiMarketCard'
import PredictionCard from '../components/live/PredictionCard'
import MempoolCard from '../components/live/MempoolCard'
import TradeCard from '../components/live/TradeCard'

function statusBadge(status: string) {
  const base = 'text-xs font-semibold uppercase px-2 py-0.5 rounded'
  if (status === 'completed') return <span className={clsx(base, 'bg-netflix-green/15 text-netflix-green')}>completed</span>
  if (status === 'error') return <span className={clsx(base, 'bg-netflix-red/15 text-netflix-red')}>error</span>
  return <span className={clsx(base, 'bg-netflix-yellow/15 text-netflix-yellow')}>{status}</span>
}

export default function CycleDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const cycleId = id ? parseInt(id, 10) : null
  const { data, isLoading, error } = useCycleDetail(cycleId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-2 border-netflix-red border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/history')}
          className="flex items-center gap-2 text-sm text-netflix-muted hover:text-netflix-text transition-colors"
        >
          <ArrowLeft size={16} /> Back to history
        </button>
        <div className="card text-center py-12 text-netflix-red font-semibold">
          Cycle not found
        </div>
      </div>
    )
  }

  const elapsed = data.elapsed_seconds ?? 0
  const latest = data.btc_snapshots.length > 0 ? data.btc_snapshots[data.btc_snapshots.length - 1] : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-3">
        <button
          onClick={() => navigate('/history')}
          className="flex items-center gap-2 text-sm text-netflix-muted hover:text-netflix-text transition-colors"
        >
          <ArrowLeft size={16} /> Back to history
        </button>

        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">Cycle #{data.cycle_id}</h1>
              {data.status && statusBadge(data.status)}
            </div>
            {data.market_title && (
              <p className="text-netflix-muted text-sm">{data.market_title}</p>
            )}
          </div>
          <div className="text-right text-xs text-netflix-dim space-y-0.5">
            <p className="font-mono">{data.market_ticker}</p>
            {data.cycle_start && (
              <p>{format(new Date(data.cycle_start), 'yyyy-MM-dd HH:mm:ss')} UTC</p>
            )}
            {data.target_price != null && (
              <p>Target: ${data.target_price.toLocaleString()}</p>
            )}
          </div>
        </div>
      </div>

      {/* Timeline (static — shows where the cycle ended) */}
      {data.elapsed_seconds != null && (
        <CycleTimeline
          elapsed={elapsed}
          phase={data.phase}
          config={data.cycle_config}
        />
      )}

      {/* Trade card */}
      {data.trade && (
        <TradeCard trade={data.trade} phase={data.phase} />
      )}

      {/* Main charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <BTCAnalysisChart snapshots={data.btc_snapshots} targetPrice={data.target_price} />
        </div>
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

      {/* BTC Snapshot table */}
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
