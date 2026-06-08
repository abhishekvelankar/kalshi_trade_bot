import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'
import type { LiveBTCSnapshot } from '../../types'

interface Props {
  snapshots: LiveBTCSnapshot[]
  targetPrice?: number | null
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-netflix-card border border-netflix-border rounded-lg p-3 text-xs space-y-1">
      <p className="text-netflix-muted font-medium">Minute {label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(p.name === 'Price' ? 2 : 4) : '—'}
        </p>
      ))}
    </div>
  )
}

export default function BTCAnalysisChart({ snapshots, targetPrice }: Props) {
  if (snapshots.length === 0) {
    return (
      <div className="card flex items-center justify-center h-64">
        <p className="text-netflix-dim text-sm">Waiting for first BTC snapshot…</p>
      </div>
    )
  }

  const data = snapshots.map((s) => ({
    minute: s.minute,
    Price: s.price_usd,
    Momentum: s.momentum_score ?? 0,
    'Change 5m %': s.price_change_5m != null ? +(s.price_change_5m * 100).toFixed(4) : null,
  }))

  const prices = snapshots.map((s) => s.price_usd)
  const minP = Math.min(...prices)
  const maxP = Math.max(...prices)
  const pad = Math.max((maxP - minP) * 0.5, 10)

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">BTC Price & Momentum</h3>
        {targetPrice != null && (
          <span className="text-xs text-netflix-muted">
            Strike: <span className="text-netflix-yellow font-mono">${targetPrice.toLocaleString()}</span>
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
          <XAxis
            dataKey="minute"
            tick={{ fill: '#6d6d6d', fontSize: 10 }}
            tickLine={false}
            label={{ value: 'Minute', position: 'insideBottom', offset: -2, fill: '#6d6d6d', fontSize: 10 }}
          />
          {/* Left axis: price */}
          <YAxis
            yAxisId="price"
            orientation="left"
            tick={{ fill: '#6d6d6d', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            domain={[minP - pad, maxP + pad]}
            tickFormatter={(v) => `$${v.toLocaleString()}`}
            width={80}
          />
          {/* Right axis: momentum */}
          <YAxis
            yAxisId="momentum"
            orientation="right"
            domain={[-1, 1]}
            tick={{ fill: '#6d6d6d', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconSize={8}
            formatter={(v) => <span style={{ color: '#b3b3b3', fontSize: 11 }}>{v}</span>}
          />
          <ReferenceLine yAxisId="momentum" y={0} stroke="#3a3a3a" strokeDasharray="4 2" />
          {targetPrice != null && (
            <ReferenceLine
              yAxisId="price"
              y={targetPrice}
              stroke="#f5c518"
              strokeDasharray="5 3"
              label={{ value: 'Strike', position: 'insideTopRight', fill: '#f5c518', fontSize: 10 }}
            />
          )}
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="Price"
            stroke="#ffffff"
            strokeWidth={2}
            dot={{ r: 3, fill: '#ffffff' }}
            activeDot={{ r: 5 }}
          />
          <Bar
            yAxisId="momentum"
            dataKey="Momentum"
            fill="#46d369"
            opacity={0.7}
            radius={[2, 2, 0, 0]}
            // Negative bars shown in red
            label={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
