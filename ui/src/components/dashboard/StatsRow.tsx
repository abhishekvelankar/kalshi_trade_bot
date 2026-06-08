import { TrendingDown, TrendingUp, Trophy, DollarSign } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  wins: number
  losses: number
  winRate: number
  totalPnl: number
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="card flex items-center gap-4">
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', color)}>
        <Icon size={20} />
      </div>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
      </div>
    </div>
  )
}

export default function StatsRow({ wins, losses, winRate, totalPnl }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Wins"
        value={String(wins)}
        icon={Trophy}
        color="bg-green-900/40 text-netflix-green"
      />
      <StatCard
        label="Losses"
        value={String(losses)}
        icon={TrendingDown}
        color="bg-red-900/40 text-netflix-red"
      />
      <StatCard
        label="Win Rate"
        value={`${(winRate * 100).toFixed(1)}%`}
        icon={TrendingUp}
        color="bg-blue-900/40 text-blue-400"
      />
      <StatCard
        label="Total P&L"
        value={`$${totalPnl.toFixed(2)}`}
        icon={DollarSign}
        color={
          totalPnl >= 0
            ? 'bg-green-900/40 text-netflix-green'
            : 'bg-red-900/40 text-netflix-red'
        }
      />
    </div>
  )
}
