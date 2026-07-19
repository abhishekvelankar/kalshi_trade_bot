import { useState } from 'react'
import { format } from 'date-fns'
import clsx from 'clsx'
import { useTrades } from '../hooks/useApi'
import Badge from '../components/common/Badge'

const OUTCOMES = ['all', 'win', 'loss', 'pending']

export default function Trades() {
  const [outcome, setOutcome] = useState('all')
  const { data: trades, isLoading } = useTrades({
    outcome: outcome === 'all' ? undefined : outcome,
    limit: 200,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trade History</h1>
        <div className="flex gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o}
              onClick={() => setOutcome(o)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize',
                outcome === o
                  ? 'bg-netflix-red text-white'
                  : 'bg-netflix-surface text-netflix-muted hover:text-netflix-text',
              )}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-netflix-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !trades?.length ? (
          <p className="text-netflix-dim text-sm py-12 text-center">No trades found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-netflix-muted border-b border-netflix-border text-left">
                <th className="py-3 pr-4 font-medium">ID</th>
                <th className="py-3 pr-4 font-medium">Date / Time</th>
                <th className="py-3 pr-4 font-medium">Market</th>
                <th className="py-3 pr-4 font-medium">vs Strike</th>
                <th className="py-3 pr-4 font-medium">Side</th>
                <th className="py-3 pr-4 font-medium text-right">Contracts</th>
                <th className="py-3 pr-4 font-medium text-right">Price</th>
                <th className="py-3 pr-4 font-medium text-right">Cost</th>
                <th className="py-3 pr-4 font-medium">Mode</th>
                <th className="py-3 pr-4 font-medium">Outcome</th>
                <th className="py-3 font-medium text-right">P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-netflix-border/30">
              {trades.map((t) => (
                <tr key={t.id} className="hover:bg-netflix-card/40 transition-colors">
                  <td className="py-3 pr-4 text-netflix-dim font-mono">#{t.id}</td>
                  <td className="py-3 pr-4 text-netflix-muted font-mono text-xs whitespace-nowrap">
                    {format(new Date(t.placed_at), 'MMM dd HH:mm')}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-netflix-muted">{t.ticker}</td>
                  <td className="py-3 pr-4 text-xs">
                    {t.strike_diff != null && t.strike_diff_pct != null ? (
                      <div>
                        <span className={clsx('font-semibold font-mono', t.strike_diff >= 0 ? 'text-netflix-green' : 'text-netflix-red')}>
                          {t.strike_diff >= 0 ? '+' : ''}{t.strike_diff_pct.toFixed(2)}%
                        </span>
                        <p className="text-netflix-dim mt-0.5">
                          ${t.coin_price?.toLocaleString()} vs ${t.strike_price?.toLocaleString()}
                        </p>
                      </div>
                    ) : <span className="text-netflix-dim">—</span>}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge value={t.side.toUpperCase()} variant="auto" />
                  </td>
                  <td className="py-3 pr-4 text-right font-medium">{t.contracts}</td>
                  <td className="py-3 pr-4 text-right text-netflix-muted">{t.price_per_contract}¢</td>
                  <td className="py-3 pr-4 text-right font-medium">${t.total_cost.toFixed(2)}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={clsx(
                        'text-xs font-semibold',
                        t.is_paper ? 'text-netflix-yellow' : 'text-netflix-green',
                      )}
                    >
                      {t.is_paper ? 'Paper' : 'Live'}
                    </span>
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
                    {t.pnl != null
                      ? `${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
