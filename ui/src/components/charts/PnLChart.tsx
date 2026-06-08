import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import { format } from 'date-fns'
import type { Trade } from '../../types'

interface Props {
  trades: Trade[]
}

interface DataPoint {
  time: string
  cumPnl: number
  pnl: number
}

function buildChartData(trades: Trade[]): DataPoint[] {
  const sorted = [...trades]
    .filter((t) => t.pnl != null)
    .sort((a, b) => new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime())

  let cum = 0
  return sorted.map((t) => {
    cum += t.pnl!
    return {
      time: format(new Date(t.placed_at), 'MM/dd HH:mm'),
      cumPnl: parseFloat(cum.toFixed(2)),
      pnl: t.pnl!,
    }
  })
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as DataPoint
  return (
    <div className="bg-netflix-card border border-netflix-border rounded-lg p-3 text-xs">
      <p className="text-netflix-muted mb-1">{label}</p>
      <p className={d.cumPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
        Cumulative: ${d.cumPnl.toFixed(2)}
      </p>
      <p className={d.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
        This trade: ${d.pnl.toFixed(2)}
      </p>
    </div>
  )
}

export default function PnLChart({ trades }: Props) {
  const data = buildChartData(trades)
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.cumPnl)), 1)

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Cumulative P&L</h2>
      {data.length === 0 ? (
        <p className="text-netflix-dim text-sm py-8 text-center">No resolved trades yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#46d369" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#46d369" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
            <XAxis dataKey="time" tick={{ fill: '#6d6d6d', fontSize: 10 }} tickLine={false} />
            <YAxis
              tick={{ fill: '#6d6d6d', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}`}
              domain={[-maxAbs * 1.1, maxAbs * 1.1]}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#3a3a3a" strokeDasharray="4 2" />
            <Area
              type="monotone"
              dataKey="cumPnl"
              stroke="#46d369"
              strokeWidth={2}
              fill="url(#pnlGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
