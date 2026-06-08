import clsx from 'clsx'
import type { LiveMarketState, CycleConfig } from '../../types'
import { format } from 'date-fns'

interface Props {
  market: LiveMarketState | null
  config: CycleConfig
}

function ProbBar({ prob, label, color }: { prob: number; label: string; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs font-medium text-netflix-muted">{label}</span>
        <span className={clsx('text-2xl font-black', color)}>
          {(prob * 100).toFixed(0)}%
        </span>
      </div>
      <div className="h-2 bg-netflix-card rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-500', color === 'text-netflix-green' ? 'bg-netflix-green' : 'bg-netflix-red')}
          style={{ width: `${prob * 100}%` }}
        />
      </div>
    </div>
  )
}

export default function KalshiMarketCard({ market, config }: Props) {
  if (!market) {
    return (
      <div className="card flex flex-col items-center justify-center h-full min-h-40">
        <p className="text-netflix-dim text-sm">Market snapshot pending…</p>
        <p className="text-netflix-dim text-xs mt-1">Available after {config.data_window_minutes}m mark</p>
      </div>
    )
  }

  const yesAbove = market.yes_prob >= config.yes_threshold
  const noAbove = market.no_prob >= config.no_threshold

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Kalshi Market</h3>
        <span className="text-xs text-netflix-dim font-mono">
          {format(new Date(market.captured_at), 'HH:mm:ss')}
        </span>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <ProbBar prob={market.yes_prob} label="YES" color="text-netflix-green" />
          {yesAbove && (
            <span className="absolute right-0 top-0 text-xs text-netflix-green font-semibold">
              ✓ above threshold
            </span>
          )}
        </div>
        <div className="relative">
          <ProbBar prob={market.no_prob} label="NO" color="text-netflix-red" />
          {noAbove && (
            <span className="absolute right-0 top-0 text-xs text-netflix-red font-semibold">
              ✓ above threshold
            </span>
          )}
        </div>
      </div>

      <div className="pt-2 border-t border-netflix-border grid grid-cols-2 gap-2 text-xs">
        <div className="bg-netflix-card rounded px-2 py-1.5">
          <p className="text-netflix-dim">YES price</p>
          <p className="font-semibold">{market.yes_price}¢</p>
        </div>
        <div className="bg-netflix-card rounded px-2 py-1.5">
          <p className="text-netflix-dim">NO price</p>
          <p className="font-semibold">{market.no_price}¢</p>
        </div>
        <div className="bg-netflix-card rounded px-2 py-1.5 col-span-2">
          <p className="text-netflix-dim">Threshold</p>
          <p className="font-semibold">{(config.yes_threshold * 100).toFixed(0)}% required to trade</p>
        </div>
      </div>

      {market.close_time && (
        <p className="text-xs text-netflix-dim">
          Closes at {format(new Date(market.close_time), 'HH:mm:ss')} UTC
        </p>
      )}
    </div>
  )
}
