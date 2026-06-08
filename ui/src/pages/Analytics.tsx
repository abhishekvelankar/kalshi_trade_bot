import { useState, useMemo } from 'react'
import {
  startOfDay, startOfMonth, startOfYear, subDays,
  eachDayOfInterval, eachMonthOfInterval,
  format, isSameDay, isSameMonth, isSameYear,
} from 'date-fns'
import clsx from 'clsx'
import { useTrades, usePerformance } from '../hooks/useApi'
import PnLChart from '../components/charts/PnLChart'
import WinRateChart from '../components/charts/WinRateChart'
import type { Trade } from '../types'

// ── Types ──────────────────────────────────────────────────────────────────────

type Period = 'Today' | 'Week' | 'Month' | 'Year' | 'All Time'

interface Stats {
  trades: number
  wins: number
  losses: number
  pending: number
  win_rate: number
  pnl: number
  invested: number
}

interface BreakdownRow {
  label: string
  sublabel?: string
  stats: Stats
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcStats(trades: Trade[]): Stats {
  const wins = trades.filter(t => t.outcome === 'win').length
  const losses = trades.filter(t => t.outcome === 'loss').length
  const pending = trades.filter(t => t.outcome === 'pending').length
  const resolved = wins + losses
  return {
    trades: trades.length,
    wins,
    losses,
    pending,
    win_rate: resolved > 0 ? wins / resolved : 0,
    pnl: trades.reduce((s, t) => s + (t.pnl ?? 0), 0),
    invested: trades.reduce((s, t) => s + t.total_cost, 0),
  }
}

function filterPeriod(trades: Trade[], period: Period): Trade[] {
  const now = new Date()
  const ts = (t: Trade) => new Date(t.placed_at)
  switch (period) {
    case 'Today':  return trades.filter(t => ts(t) >= startOfDay(now))
    case 'Week':   return trades.filter(t => ts(t) >= subDays(startOfDay(now), 6))
    case 'Month':  return trades.filter(t => ts(t) >= startOfMonth(now))
    case 'Year':   return trades.filter(t => ts(t) >= startOfYear(now))
    case 'All Time': return trades
  }
}

function buildBreakdown(trades: Trade[], period: Period): BreakdownRow[] {
  const now = new Date()

  if (period === 'Today') {
    // Each hour of today that has at least one trade
    const todayTrades = trades.filter(t => new Date(t.placed_at) >= startOfDay(now))
    const byHour = new Map<number, Trade[]>()
    todayTrades.forEach(t => {
      const h = new Date(t.placed_at).getUTCHours()
      if (!byHour.has(h)) byHour.set(h, [])
      byHour.get(h)!.push(t)
    })
    return Array.from(byHour.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([h, ts]) => ({
        label: `${String(h).padStart(2, '0')}:00 UTC`,
        stats: calcStats(ts),
      }))
  }

  if (period === 'Week') {
    const days = eachDayOfInterval({ start: subDays(startOfDay(now), 6), end: now })
    return days.reverse().map(day => ({
      label: format(day, 'EEE'),
      sublabel: format(day, 'MMM d'),
      stats: calcStats(trades.filter(t => isSameDay(new Date(t.placed_at), day))),
    }))
  }

  if (period === 'Month') {
    const days = eachDayOfInterval({ start: startOfMonth(now), end: now })
    return days.reverse().map(day => ({
      label: format(day, 'MMM d'),
      sublabel: format(day, 'EEE'),
      stats: calcStats(trades.filter(t => isSameDay(new Date(t.placed_at), day))),
    }))
  }

  if (period === 'Year') {
    const months = eachMonthOfInterval({ start: startOfYear(now), end: now })
    return months.reverse().map(month => ({
      label: format(month, 'MMMM'),
      sublabel: format(month, 'yyyy'),
      stats: calcStats(trades.filter(t => isSameMonth(new Date(t.placed_at), month))),
    }))
  }

  // All Time — group by month
  if (trades.length === 0) return []
  const oldest = new Date(Math.min(...trades.map(t => new Date(t.placed_at).getTime())))
  const months = eachMonthOfInterval({ start: startOfMonth(oldest), end: now })
  return months.reverse().map(month => ({
    label: format(month, 'MMM yyyy'),
    stats: calcStats(trades.filter(t => isSameMonth(new Date(t.placed_at), month))),
  }))
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, positive,
}: {
  label: string; value: string; sub?: string; positive?: boolean
}) {
  return (
    <div className="card">
      <p className="stat-label">{label}</p>
      <p className={clsx('stat-value mt-1', positive === true && 'text-netflix-green', positive === false && 'text-netflix-red')}>
        {value}
      </p>
      {sub && <p className="text-xs text-netflix-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function WinRateBadge({ rate, resolved }: { rate: number; resolved: number }) {
  if (resolved === 0) return <span className="text-netflix-dim text-xs">—</span>
  const pct = (rate * 100).toFixed(0)
  return (
    <span className={clsx(
      'text-xs font-semibold',
      rate >= 0.65 ? 'text-netflix-green' : rate >= 0.5 ? 'text-yellow-400' : 'text-netflix-red',
    )}>
      {pct}%
    </span>
  )
}

function BreakdownTable({ rows }: { rows: BreakdownRow[] }) {
  if (rows.length === 0) {
    return <p className="text-netflix-dim text-sm text-center py-8">No data for this period.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-netflix-muted text-xs border-b border-netflix-border text-left">
            <th className="py-2 pr-4 font-medium">Period</th>
            <th className="py-2 pr-4 font-medium text-center">Trades</th>
            <th className="py-2 pr-4 font-medium text-center">W / L</th>
            <th className="py-2 pr-4 font-medium text-center">Win Rate</th>
            <th className="py-2 font-medium text-right">P&amp;L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-netflix-border/30">
          {rows.map((row, i) => (
            <tr key={i} className={clsx('hover:bg-netflix-card/40', row.stats.trades === 0 && 'opacity-40')}>
              <td className="py-2.5 pr-4">
                <span className="font-medium">{row.label}</span>
                {row.sublabel && <span className="ml-1.5 text-xs text-netflix-dim">{row.sublabel}</span>}
              </td>
              <td className="py-2.5 pr-4 text-center text-netflix-muted">
                {row.stats.trades > 0 ? row.stats.trades : '—'}
              </td>
              <td className="py-2.5 pr-4 text-center">
                {row.stats.trades > 0 ? (
                  <span>
                    <span className="text-netflix-green font-semibold">{row.stats.wins}</span>
                    <span className="text-netflix-dim mx-1">/</span>
                    <span className="text-netflix-red font-semibold">{row.stats.losses}</span>
                    {row.stats.pending > 0 && (
                      <span className="text-yellow-400 font-semibold ml-1">+{row.stats.pending}p</span>
                    )}
                  </span>
                ) : '—'}
              </td>
              <td className="py-2.5 pr-4 text-center">
                <WinRateBadge rate={row.stats.win_rate} resolved={row.stats.wins + row.stats.losses} />
              </td>
              <td className={clsx(
                'py-2.5 text-right font-mono font-semibold',
                row.stats.pnl > 0 ? 'text-netflix-green' : row.stats.pnl < 0 ? 'text-netflix-red' : 'text-netflix-muted',
              )}>
                {row.stats.trades > 0
                  ? `${row.stats.pnl >= 0 ? '+' : ''}$${row.stats.pnl.toFixed(2)}`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

const PERIODS: Period[] = ['Today', 'Week', 'Month', 'Year', 'All Time']

export default function Analytics() {
  const [period, setPeriod] = useState<Period>('Week')
  const { data: allTrades = [] } = useTrades({ limit: 500 })
  const { data: perf } = usePerformance()

  const startingBalance = perf?.starting_balance ?? 1000

  const filtered = useMemo(() => filterPeriod(allTrades, period), [allTrades, period])
  const stats = useMemo(() => calcStats(filtered), [filtered])
  const breakdown = useMemo(() => buildBreakdown(allTrades, period), [allTrades, period])

  // ROI = P&L for this period / starting bankroll.
  // The same capital recycles across trades — not new money each time.
  const roi = ((stats.pnl / startingBalance) * 100).toFixed(2)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold">Analytics</h1>

        {/* Period selector */}
        <div className="flex flex-wrap gap-1 bg-netflix-card border border-netflix-border rounded-lg p-1 w-fit">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={clsx(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
                period === p
                  ? 'bg-netflix-red text-white'
                  : 'text-netflix-muted hover:text-netflix-text',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Trades"
          value={String(stats.trades)}
          sub={`${stats.wins}W · ${stats.losses}L · ${stats.pending}P`}
        />
        <MetricCard
          label="Win Rate"
          value={stats.wins + stats.losses > 0 ? `${(stats.win_rate * 100).toFixed(1)}%` : '—'}
          sub={`${stats.wins} wins of ${stats.wins + stats.losses} resolved`}
          positive={stats.wins + stats.losses > 0 ? stats.win_rate >= 0.5 : undefined}
        />
        <MetricCard
          label="Net P&L"
          value={`${stats.pnl >= 0 ? '+' : ''}$${stats.pnl.toFixed(2)}`}
          positive={stats.pnl >= 0}
        />
        <MetricCard
          label="ROI"
          value={`${parseFloat(roi) >= 0 ? '+' : ''}${roi}%`}
          sub={`on $${startingBalance.toLocaleString()} bankroll`}
          positive={parseFloat(roi) >= 0}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PnLChart trades={filtered} />
        <WinRateChart wins={stats.wins} losses={stats.losses} pending={stats.pending} />
      </div>

      {/* Breakdown table */}
      <div className="card">
        <h3 className="font-semibold mb-4">
          {period === 'Today' ? 'Hourly Breakdown' :
           period === 'Week' ? 'Daily Breakdown — Last 7 Days' :
           period === 'Month' ? 'Daily Breakdown — This Month' :
           period === 'Year' ? 'Monthly Breakdown — This Year' :
           'Monthly Breakdown — All Time'}
        </h3>
        <BreakdownTable rows={breakdown} />
      </div>
    </div>
  )
}
