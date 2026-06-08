import clsx from 'clsx'
import type { CycleConfig } from '../../types'

interface Props {
  elapsed: number     // seconds
  phase: string | null
  config: CycleConfig
}

export default function CycleTimeline({ elapsed, phase, config }: Props) {
  const total = config.cycle_minutes * 60
  const progress = Math.min(elapsed / total, 1)
  const progressPct = (progress * 100).toFixed(1)

  const dataEndPct = (config.data_window_minutes / config.cycle_minutes) * 100
  const tradeStartPct = (config.trade_start_minutes / config.cycle_minutes) * 100
  const tradeEndPct = (config.trade_end_minutes / config.cycle_minutes) * 100

  const elapsedMin = Math.floor(elapsed / 60)
  const elapsedSec = Math.floor(elapsed % 60)

  const phaseLabel: Record<string, { label: string; color: string }> = {
    collecting: { label: 'Collecting BTC data', color: 'text-blue-400' },
    predicting: { label: 'Running prediction', color: 'text-netflix-yellow' },
    trading: { label: 'Trade window open', color: 'text-netflix-green' },
    resolving: { label: 'Waiting for resolution', color: 'text-netflix-muted' },
    completed: { label: 'Cycle complete', color: 'text-netflix-muted' },
    error: { label: 'Interrupted', color: 'text-netflix-red' },
  }
  const currentPhase = phase ? (phaseLabel[phase] ?? { label: phase, color: 'text-netflix-muted' }) : null

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-sm">Cycle Timeline</h3>
          {currentPhase && (
            <span className={clsx('text-xs font-medium', currentPhase.color)}>
              • {currentPhase.label}
            </span>
          )}
        </div>
        <span className="font-mono text-sm text-netflix-muted">
          {elapsedMin}:{String(elapsedSec).padStart(2, '0')} / {config.cycle_minutes}:00
        </span>
      </div>

      {/* Timeline bar */}
      <div className="relative h-8 rounded-lg overflow-hidden bg-netflix-card flex">
        {/* Data collection zone */}
        <div
          className="h-full bg-blue-900/50 border-r border-netflix-border flex items-center justify-center"
          style={{ width: `${dataEndPct}%` }}
        >
          <span className="text-xs text-blue-400 font-medium whitespace-nowrap px-1">
            Data 0–{config.data_window_minutes}m
          </span>
        </div>

        {/* Trade window zone */}
        <div
          className="h-full bg-yellow-900/30 border-r border-netflix-border flex items-center justify-center"
          style={{ width: `${tradeEndPct - tradeStartPct}%` }}
        >
          <span className="text-xs text-netflix-yellow font-medium whitespace-nowrap px-1">
            Trade {config.trade_start_minutes}–{config.trade_end_minutes}m
          </span>
        </div>

        {/* Remainder */}
        <div className="h-full flex-1 flex items-center justify-center">
          <span className="text-xs text-netflix-dim px-1">Close</span>
        </div>

        {/* Progress overlay */}
        <div
          className="absolute inset-y-0 left-0 bg-white/10 pointer-events-none transition-all duration-1000"
          style={{ width: `${progressPct}%` }}
        />

        {/* Current position needle */}
        <div
          className="absolute inset-y-0 w-0.5 bg-white transition-all duration-1000"
          style={{ left: `calc(${progressPct}% - 1px)` }}
        />
      </div>

      {/* Minute markers */}
      <div className="flex justify-between text-xs text-netflix-dim px-0.5">
        {Array.from({ length: config.cycle_minutes + 1 }, (_, i) => (
          <span
            key={i}
            className={clsx(
              i === config.data_window_minutes && 'text-blue-400 font-medium',
              i === config.trade_start_minutes && 'text-netflix-yellow font-medium',
              i === config.cycle_minutes && 'text-netflix-muted',
            )}
          >
            {i}
          </span>
        ))}
      </div>
    </div>
  )
}
