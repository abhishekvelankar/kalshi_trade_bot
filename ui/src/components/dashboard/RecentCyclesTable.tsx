import { format } from 'date-fns'
import clsx from 'clsx'
import { AlertCircle, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import type { RecentCycleItem } from '../../types'
import Badge from '../common/Badge'

interface Props {
  cycles: RecentCycleItem[]
}

function ActionIcon({ action }: { action: string | null }) {
  if (action === 'YES') return <TrendingUp size={14} className="text-netflix-green" />
  if (action === 'NO') return <TrendingDown size={14} className="text-netflix-red" />
  return <Minus size={14} className="text-netflix-dim" />
}

export default function RecentCyclesTable({ cycles }: Props) {
  if (cycles.length === 0) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Recent Cycles</h2>
        <p className="text-netflix-dim text-sm py-8 text-center">No cycles yet.</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Recent Cycles</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-netflix-muted border-b border-netflix-border text-left">
              <th className="py-2 pr-4 font-medium">Time</th>
              <th className="py-2 pr-4 font-medium">Market</th>
              <th className="py-2 pr-4 font-medium">Decision</th>
              <th className="py-2 pr-4 font-medium">Kalshi YES</th>
              <th className="py-2 pr-4 font-medium">Score</th>
              <th className="py-2 pr-4 font-medium">vs Strike</th>
              <th className="py-2 pr-4 font-medium">Reason / Outcome</th>
              <th className="py-2 text-right font-medium">P&L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-netflix-border/40">
            {cycles.map((c) => {
              const isSkip = c.prediction_action === 'SKIP' || c.prediction_action === null
              const isRunning = c.status === 'running'

              return (
                <tr key={c.id} className="hover:bg-netflix-card/40 transition-colors">
                  {/* Time */}
                  <td className="py-3 pr-4 text-netflix-muted font-mono text-xs whitespace-nowrap">
                    {format(new Date(c.cycle_start), 'MM/dd HH:mm')}
                  </td>

                  {/* Market */}
                  <td className="py-3 pr-4 font-mono text-xs text-netflix-muted">
                    {c.market_ticker}
                  </td>

                  {/* Decision */}
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1.5">
                      <ActionIcon action={c.prediction_action} />
                      {isRunning && !c.prediction_action ? (
                        <span className="text-xs text-netflix-yellow font-medium">Collecting…</span>
                      ) : c.status === 'error' && !c.prediction_action ? (
                        <span className="text-xs text-netflix-dim font-medium">—</span>
                      ) : (
                        <Badge value={c.prediction_action ?? 'SKIP'} variant="auto" />
                      )}
                    </div>
                    {c.prediction_confidence !== null && (
                      <p className="text-xs text-netflix-dim mt-0.5">
                        {(c.prediction_confidence * 100).toFixed(1)}% conf
                      </p>
                    )}
                  </td>

                  {/* Kalshi YES prob */}
                  <td className="py-3 pr-4 text-xs">
                    {c.kalshi_yes_prob !== null ? (
                      <span
                        className={clsx(
                          'font-medium',
                          c.kalshi_yes_prob >= 0.85
                            ? 'text-netflix-green'
                            : c.kalshi_yes_prob <= 0.15
                            ? 'text-netflix-red'
                            : 'text-netflix-muted',
                        )}
                      >
                        {(c.kalshi_yes_prob * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-netflix-dim">—</span>
                    )}
                  </td>

                  {/* Coin momentum score */}
                  <td className="py-3 pr-4 text-xs">
                    {c.btc_score !== null ? (
                      <span
                        className={clsx(
                          'font-mono font-medium',
                          c.btc_score > 0.1
                            ? 'text-netflix-green'
                            : c.btc_score < -0.1
                            ? 'text-netflix-red'
                            : 'text-netflix-muted',
                        )}
                      >
                        {c.btc_score >= 0 ? '+' : ''}{c.btc_score.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-netflix-dim">—</span>
                    )}
                  </td>

                  {/* Strike diff */}
                  <td className="py-3 pr-4 text-xs">
                    {c.strike_diff != null && c.strike_diff_pct != null ? (
                      <div>
                        <span className={clsx('font-semibold font-mono', c.strike_diff >= 0 ? 'text-netflix-green' : 'text-netflix-red')}>
                          {c.strike_diff >= 0 ? '+' : ''}{c.strike_diff_pct.toFixed(2)}%
                        </span>
                        <p className="text-netflix-dim mt-0.5">${c.coin_price?.toLocaleString()}</p>
                      </div>
                    ) : (
                      <span className="text-netflix-dim">—</span>
                    )}
                  </td>

                  {/* Reason / Outcome */}
                  <td className="py-3 pr-4 max-w-xs">
                    {isSkip && c.skip_reason ? (
                      <div className="flex items-start gap-1.5">
                        <AlertCircle
                          size={13}
                          className="text-netflix-dim shrink-0 mt-0.5"
                        />
                        <span className="text-xs text-netflix-muted leading-snug">
                          {c.skip_reason}
                        </span>
                      </div>
                    ) : isSkip && isRunning ? (
                      <span className="text-xs text-netflix-dim">Pending prediction…</span>
                    ) : c.status === 'error' && !c.prediction_action ? (
                      <span className="text-xs text-netflix-dim italic">Interrupted by restart</span>
                    ) : !isSkip && c.trade_outcome ? (
                      <div className="flex items-center gap-2">
                        <Badge value={c.trade_outcome} variant="auto" />
                        {c.trade_side && (
                          <span className="text-xs text-netflix-dim">
                            {c.trade_side.toUpperCase()} · ${c.trade_cost?.toFixed(2)}
                            {c.is_paper && (
                              <span className="ml-1 text-netflix-yellow">(paper)</span>
                            )}
                          </span>
                        )}
                      </div>
                    ) : !isSkip ? (
                      <span className="text-xs text-netflix-dim">Trade placed, pending…</span>
                    ) : (
                      <span className="text-xs text-netflix-dim">—</span>
                    )}
                  </td>

                  {/* P&L */}
                  <td
                    className={clsx(
                      'py-3 text-right font-semibold text-sm',
                      c.trade_pnl == null
                        ? 'text-netflix-dim'
                        : c.trade_pnl >= 0
                        ? 'text-netflix-green'
                        : 'text-netflix-red',
                    )}
                  >
                    {c.trade_pnl != null
                      ? `${c.trade_pnl >= 0 ? '+' : ''}$${c.trade_pnl.toFixed(2)}`
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
