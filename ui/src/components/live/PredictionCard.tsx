import clsx from 'clsx'
import { AlertCircle, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import type { LivePrediction, CycleConfig } from '../../types'

interface Props {
  prediction: LivePrediction | null
  phase: string | null
  config: CycleConfig
}

function ScoreBar({ label, value, max = 1, color }: { label: string; value: number; max?: number; color: string }) {
  const pct = Math.min(Math.abs(value) / max, 1) * 100
  const isNeg = value < 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-netflix-muted">{label}</span>
        <span className={clsx('font-semibold', color)}>
          {value >= 0 ? '+' : ''}{(value * 100).toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 bg-netflix-card rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-500', isNeg ? 'bg-netflix-red' : color === 'text-netflix-green' ? 'bg-netflix-green' : 'bg-blue-400')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

interface BtcBreakdown {
  dist_from_strike_pct?: number | null
  price_change_1m_pct?: number | null
  price_change_5m_pct?: number | null
}

function MomentumBreakdown({
  detail,
  flipColors,
}: {
  detail: Record<string, unknown> | null
  flipColors: boolean
}) {
  const btc = (detail?.btc ?? null) as BtcBreakdown | null
  if (!btc) return null

  const rows: Array<{ label: string; val: string; positive: boolean }> = []

  if (btc.dist_from_strike_pct != null) {
    const v = btc.dist_from_strike_pct
    // For NO trades: being below strike (negative) is good → flip "positive" coloring
    rows.push({ label: 'vs strike (50%)', val: `${v >= 0 ? '+' : ''}${v.toFixed(3)}%`, positive: flipColors ? v < 0 : v >= 0 })
  }
  if (btc.price_change_1m_pct != null) {
    const v = btc.price_change_1m_pct * 100
    rows.push({ label: '1m change (30%)', val: `${v >= 0 ? '+' : ''}${v.toFixed(3)}%`, positive: flipColors ? v < 0 : v >= 0 })
  }
  if (btc.price_change_5m_pct != null) {
    const v = btc.price_change_5m_pct * 100
    rows.push({ label: '5m change (20%)', val: `${v >= 0 ? '+' : ''}${v.toFixed(3)}%`, positive: flipColors ? v < 0 : v >= 0 })
  }

  if (rows.length === 0) return null

  return (
    <div className="ml-3 pl-3 border-l border-netflix-border/40 space-y-1">
      {rows.map(({ label, val, positive }) => (
        <div key={label} className="flex justify-between text-xs">
          <span className="text-netflix-dim">{label}</span>
          <span className={`font-mono font-semibold ${positive ? 'text-netflix-green' : 'text-netflix-red'}`}>{val}</span>
        </div>
      ))}
    </div>
  )
}

export default function PredictionCard({ prediction, phase, config }: Props) {
  const isPending = !prediction && (phase === 'collecting' || phase === 'predicting')

  if (isPending) {
    return (
      <div className="card flex flex-col items-center justify-center min-h-40 space-y-2">
        <div className="w-6 h-6 border-2 border-netflix-red border-t-transparent rounded-full animate-spin" />
        <p className="text-netflix-dim text-sm">
          {phase === 'collecting' ? `Predicting after ${config.data_window_minutes}m…` : 'Computing prediction…'}
        </p>
      </div>
    )
  }

  if (!prediction) {
    return (
      <div className="card flex items-center justify-center min-h-40">
        <p className="text-netflix-dim text-sm">No prediction available</p>
      </div>
    )
  }

  const actionStyles = {
    YES: { icon: TrendingUp, color: 'text-netflix-green', bg: 'bg-green-900/30 border-netflix-green/30' },
    NO: { icon: TrendingDown, color: 'text-netflix-red', bg: 'bg-red-900/30 border-netflix-red/30' },
    SKIP: { icon: Minus, color: 'text-netflix-muted', bg: 'bg-netflix-card border-netflix-border' },
  }
  const style = actionStyles[prediction.action] ?? actionStyles.SKIP
  const ActionIcon = style.icon

  // For NO trades, show everything from the NO perspective so the numbers
  // make intuitive sense (high values = strong signal to trade NO).
  const isNo = prediction.action === 'NO'

  const kalshiLabel = isNo ? `Kalshi NO prob (weight ${(0.6 * 100).toFixed(0)}%)` : `Kalshi YES prob (weight ${(0.6 * 100).toFixed(0)}%)`
  const kalshiValue = isNo ? 1 - prediction.kalshi_yes_prob : prediction.kalshi_yes_prob

  // BTC: for NO show bearish probability = (1 - btc_score) / 2
  const btcLabel = isNo ? `BTC bearish signal (weight ${(0.4 * 100).toFixed(0)}%)` : `BTC bullish signal (weight ${(0.4 * 100).toFixed(0)}%)`
  const btcValue = isNo ? (1 - prediction.btc_score) / 2 : (prediction.btc_score + 1) / 2
  const btcColor = isNo
    ? (prediction.btc_score <= 0 ? 'text-netflix-green' : 'text-netflix-red')  // negative score = green for NO
    : (prediction.btc_score >= 0 ? 'text-netflix-green' : 'text-netflix-red')

  // Combined: for NO show the NO confidence (1 - combined_score)
  const combinedLabel = isNo ? 'NO confidence' : 'Combined score'
  const combinedValue = isNo ? 1 - prediction.combined_score : prediction.combined_score
  const combinedThreshold = isNo ? config.no_threshold : config.yes_threshold
  const combinedColor = combinedValue >= combinedThreshold ? 'text-netflix-green' : 'text-netflix-muted'

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Prediction</h3>
        <span className="text-xs text-netflix-dim">
          Confidence {(prediction.confidence * 100).toFixed(1)}%
        </span>
      </div>

      {/* Action badge */}
      <div className={clsx('flex items-center gap-3 rounded-xl border px-4 py-3', style.bg)}>
        <ActionIcon size={24} className={style.color} />
        <div>
          <p className={clsx('text-2xl font-black', style.color)}>{prediction.action}</p>
          <p className="text-xs text-netflix-muted">
            {isNo ? 'NO confidence' : 'Combined score'}: {(combinedValue * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Signal breakdown */}
      <div className="space-y-2.5">
        <ScoreBar
          label={kalshiLabel}
          value={kalshiValue}
          color="text-blue-400"
        />
        <ScoreBar
          label={btcLabel}
          value={btcValue}
          color={btcColor}
        />

        {/* Momentum sub-components from reasoning */}
        <MomentumBreakdown detail={prediction.reasoning_detail} flipColors={isNo} />

        <div className="pt-1 border-t border-netflix-border">
          <ScoreBar
            label={combinedLabel}
            value={combinedValue}
            color={combinedColor}
          />
        </div>
      </div>

      {/* Skip reason */}
      {prediction.action === 'SKIP' && prediction.skip_reason && (
        <div className="flex items-start gap-2 bg-netflix-card rounded-lg px-3 py-2">
          <AlertCircle size={13} className="text-netflix-dim shrink-0 mt-0.5" />
          <p className="text-xs text-netflix-muted leading-snug">{prediction.skip_reason}</p>
        </div>
      )}

      {/* Threshold reference */}
      <p className="text-xs text-netflix-dim">
        Threshold: YES ≥ {(config.yes_threshold * 100).toFixed(0)}% &amp; NO ≥ {(config.no_threshold * 100).toFixed(0)}%
      </p>
    </div>
  )
}
