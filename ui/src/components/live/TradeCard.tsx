import clsx from 'clsx'
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { LiveTrade } from '../../types'
import Badge from '../common/Badge'

interface Props {
  trade: LiveTrade | null
  phase: string | null
}

export default function TradeCard({ trade, phase }: Props) {
  const inTradeWindow = phase === 'trading' || phase === 'resolving'

  if (!trade && !inTradeWindow) return null

  if (!trade) {
    return (
      <div className="card flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-netflix-yellow border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-netflix-yellow font-medium">Trade window open — placing order…</p>
      </div>
    )
  }

  const isBuy = trade.side === 'yes'
  const winnings = trade.contracts * 1.00
  const Icon = isBuy ? TrendingUp : TrendingDown

  return (
    <div className={clsx(
      'card border-l-4 space-y-3',
      isBuy ? 'border-l-netflix-green' : 'border-l-netflix-red',
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={18} className={isBuy ? 'text-netflix-green' : 'text-netflix-red'} />
          <h3 className="font-semibold text-sm">
            {isBuy ? 'YES' : 'NO'} Trade Placed
            {trade.is_paper && (
              <span className="ml-2 text-xs font-normal text-netflix-yellow">(paper)</span>
            )}
          </h3>
        </div>
        <Badge value={trade.outcome} variant="auto" />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        {[
          ['Contracts', String(trade.contracts)],
          ['Price', `${trade.price_per_contract}¢`],
          ['Cost', `$${trade.total_cost.toFixed(2)}`],
          ['Max win', `$${winnings.toFixed(2)}`],
          ['Max loss', `-$${trade.total_cost.toFixed(2)}`],
          ['P&L', trade.pnl != null ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : '—'],
        ].map(([label, val]) => (
          <div key={label} className="bg-netflix-card rounded px-2 py-1.5">
            <p className="text-netflix-dim">{label}</p>
            <p className={clsx(
              'font-semibold',
              label === 'P&L' && trade.pnl != null
                ? trade.pnl >= 0 ? 'text-netflix-green' : 'text-netflix-red'
                : 'text-netflix-text',
            )}>{val}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
