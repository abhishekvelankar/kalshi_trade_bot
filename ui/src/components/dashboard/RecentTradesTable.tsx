import { format } from 'date-fns'
import clsx from 'clsx'
import type { Trade } from '../../types'
import Badge from '../common/Badge'

interface Props {
  trades: Trade[]
}

export default function RecentTradesTable({ trades }: Props) {
  if (trades.length === 0) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Recent Trades</h2>
        <p className="text-netflix-dim text-sm py-8 text-center">No trades yet.</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Recent Trades</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-netflix-muted border-b border-netflix-border">
              <th className="text-left py-2 pr-4 font-medium">Time</th>
              <th className="text-left py-2 pr-4 font-medium">Market</th>
              <th className="text-left py-2 pr-4 font-medium">Side</th>
              <th className="text-right py-2 pr-4 font-medium">Cost</th>
              <th className="text-left py-2 pr-4 font-medium">Outcome</th>
              <th className="text-right py-2 font-medium">P&L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-netflix-border/40">
            {trades.map((t) => (
              <tr key={t.id} className="hover:bg-netflix-card/40 transition-colors">
                <td className="py-3 pr-4 text-netflix-muted font-mono text-xs">
                  {format(new Date(t.placed_at), 'MM/dd HH:mm')}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-netflix-muted">
                  {t.ticker}
                </td>
                <td className="py-3 pr-4">
                  <Badge value={t.side.toUpperCase()} variant="auto" />
                </td>
                <td className="py-3 pr-4 text-right font-medium">
                  ${t.total_cost.toFixed(2)}
                  {t.is_paper && (
                    <span className="ml-1 text-xs text-netflix-dim">(paper)</span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <Badge value={t.outcome} variant="auto" />
                </td>
                <td
                  className={clsx(
                    'py-3 text-right font-semibold',
                    t.pnl == null
                      ? 'text-netflix-dim'
                      : t.pnl >= 0
                      ? 'text-netflix-green'
                      : 'text-netflix-red',
                  )}
                >
                  {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
