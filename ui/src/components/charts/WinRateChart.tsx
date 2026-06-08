import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Props {
  wins: number
  losses: number
  pending: number
}

const COLORS = {
  win: '#46d369',
  loss: '#e50914',
  pending: '#f5c518',
}

export default function WinRateChart({ wins, losses, pending }: Props) {
  const data = [
    { name: 'Win', value: wins, color: COLORS.win },
    { name: 'Loss', value: losses, color: COLORS.loss },
    { name: 'Pending', value: pending, color: COLORS.pending },
  ].filter((d) => d.value > 0)

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Outcome Distribution</h2>
      {data.length === 0 ? (
        <p className="text-netflix-dim text-sm py-8 text-center">No trades yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#b3b3b3' }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(v) => <span style={{ color: '#b3b3b3', fontSize: 12 }}>{v}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
