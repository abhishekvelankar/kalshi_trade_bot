import { format } from 'date-fns'
import { AlertCircle, Clock } from 'lucide-react'
import type { ActiveCycle } from '../../types'
import Badge from '../common/Badge'

interface Props {
  cycle: ActiveCycle | null
  serverTime: string
}

export default function HeroCard({ cycle, serverTime }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-netflix-border bg-gradient-to-br from-netflix-surface via-netflix-surface to-netflix-card p-6">
      {/* Red accent line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-netflix-red via-netflix-red to-transparent" />

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {cycle?.status === 'running' ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-netflix-green">
                <span className="w-1.5 h-1.5 rounded-full bg-netflix-green animate-pulse" />
                LIVE CYCLE
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-netflix-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-netflix-muted" />
                IDLE
              </span>
            )}
          </div>

          <h1 className="text-4xl font-black tracking-tight text-netflix-text">
            BTC / USD
          </h1>

          {cycle && (
            <p className="mt-1 text-sm text-netflix-muted font-mono">
              {cycle.market_ticker}
            </p>
          )}

          {cycle?.market_title && (
            <p className="mt-0.5 text-sm text-netflix-muted">{cycle.market_title}</p>
          )}
        </div>

        <div className="text-right">
          <div className="flex items-center gap-1.5 text-netflix-muted text-xs justify-end mb-2">
            <Clock size={12} />
            {format(new Date(serverTime), 'HH:mm:ss')} UTC
          </div>
          {cycle && (
            <div>
              <p className="text-xs text-netflix-muted mb-1">Cycle started</p>
              <p className="text-sm font-semibold text-netflix-text">
                {format(new Date(cycle.cycle_start), 'HH:mm:ss')}
              </p>
            </div>
          )}
        </div>
      </div>

      {cycle?.prediction_action && (
        <div className="mt-4 pt-4 border-t border-netflix-border space-y-3">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-netflix-muted mb-1">Prediction</p>
              <Badge value={cycle.prediction_action} variant="auto" />
            </div>
            {cycle.prediction_confidence !== null && (
              <div>
                <p className="text-xs text-netflix-muted mb-1">Confidence</p>
                <p className="text-sm font-semibold text-netflix-text">
                  {(cycle.prediction_confidence * 100).toFixed(1)}%
                </p>
              </div>
            )}
          </div>
          {cycle.prediction_action === 'SKIP' && cycle.skip_reason && (
            <div className="flex items-start gap-2 bg-netflix-card/60 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="text-netflix-dim shrink-0 mt-0.5" />
              <p className="text-xs text-netflix-muted leading-snug">{cycle.skip_reason}</p>
            </div>
          )}
        </div>
      )}

      {!cycle && (
        <div className="mt-4 pt-4 border-t border-netflix-border">
          <p className="text-sm text-netflix-dim">Waiting for next 15-min cycle…</p>
        </div>
      )}
    </div>
  )
}
