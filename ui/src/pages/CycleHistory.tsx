import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, Clock, History } from 'lucide-react'
import clsx from 'clsx'
import { useCycles } from '../hooks/useApi'
import Badge from '../components/common/Badge'

const PAGE_SIZE = 30

function statusColor(status: string) {
  if (status === 'completed') return 'text-netflix-green'
  if (status === 'error') return 'text-netflix-red'
  return 'text-netflix-yellow'
}

export default function CycleHistory() {
  const navigate = useNavigate()
  const [offset, setOffset] = useState(0)
  const { data: cycles, isLoading, error } = useCycles({ limit: PAGE_SIZE, offset })

  const hasPrev = offset > 0
  const hasNext = (cycles?.length ?? 0) === PAGE_SIZE

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History size={22} className="text-netflix-muted" />
          <h1 className="text-2xl font-bold">Cycle History</h1>
        </div>
        <p className="text-xs text-netflix-dim">
          Click any row to view full analysis
        </p>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-netflix-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-netflix-red font-semibold">
            Failed to load cycles
          </div>
        ) : !cycles?.length ? (
          <div className="text-center py-16">
            <Clock size={32} className="text-netflix-dim mx-auto mb-3" />
            <p className="text-netflix-muted font-semibold">No cycles recorded yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-netflix-muted border-b border-netflix-border text-left">
                <th className="py-2 pr-4 font-medium w-8">#</th>
                <th className="py-2 pr-4 font-medium">Cycle Start (UTC)</th>
                <th className="py-2 pr-4 font-medium">Ticker</th>
                <th className="py-2 pr-4 font-medium">Strike</th>
                <th className="py-2 pr-4 font-medium">vs Strike</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-netflix-border/30">
              {cycles.map((c) => {
                const durationSec = c.cycle_end
                  ? Math.round((new Date(c.cycle_end).getTime() - new Date(c.cycle_start).getTime()) / 1000)
                  : null

                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/history/${c.id}`)}
                    className="hover:bg-netflix-surface/60 cursor-pointer transition-colors"
                  >
                    <td className="py-3 pr-4 text-netflix-dim font-mono text-xs">{c.id}</td>
                    <td className="py-3 pr-4">
                      <span className="font-medium">
                        {format(new Date(c.cycle_start), 'yyyy-MM-dd')}
                      </span>
                      <span className="text-netflix-muted ml-2 font-mono text-xs">
                        {format(new Date(c.cycle_start), 'HH:mm')} UTC
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-netflix-muted">{c.market_ticker}</td>
                    <td className="py-3 pr-4 text-netflix-muted text-xs">
                      {c.target_price != null ? `$${c.target_price.toLocaleString()}` : '—'}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      {c.strike_diff != null && c.strike_diff_pct != null ? (
                        <div>
                          <span className={clsx('font-semibold font-mono', c.strike_diff >= 0 ? 'text-netflix-green' : 'text-netflix-red')}>
                            {c.strike_diff >= 0 ? '+' : ''}{c.strike_diff_pct.toFixed(2)}%
                          </span>
                          <p className="text-netflix-dim mt-0.5">${c.coin_price?.toLocaleString()}</p>
                        </div>
                      ) : <span className="text-netflix-dim">—</span>}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={clsx('text-xs font-semibold uppercase', statusColor(c.status))}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 text-netflix-muted text-xs">
                      {durationSec != null
                        ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={!hasPrev}
            className={clsx(
              'flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors',
              hasPrev
                ? 'bg-netflix-surface hover:bg-netflix-card text-netflix-text'
                : 'bg-netflix-surface/40 text-netflix-dim cursor-not-allowed',
            )}
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <span className="text-xs text-netflix-muted">
            {offset + 1}–{offset + (cycles?.length ?? 0)}
          </span>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={!hasNext}
            className={clsx(
              'flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors',
              hasNext
                ? 'bg-netflix-surface hover:bg-netflix-card text-netflix-text'
                : 'bg-netflix-surface/40 text-netflix-dim cursor-not-allowed',
            )}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
