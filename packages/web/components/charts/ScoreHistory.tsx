'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface DataPoint {
  day: string
  avgScore: number
}

function scoreColor(score: number) {
  if (score >= 0.75) return '#22c55e'
  if (score >= 0.50) return '#f59e0b'
  return '#ef4444'
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  const score: number = payload[0]?.value ?? 0
  return (
    <div className="bg-surface border border-border rounded-md px-3 py-2 text-xs font-mono shadow-xl">
      <p className="text-muted mb-1">{label}</p>
      <p style={{ color: scoreColor(score) }}>{score.toFixed(3)}</p>
    </div>
  )
}

export function ScoreHistory({ data }: { data: DataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-muted text-sm">
        No history available
      </div>
    )
  }

  const lastScore = data[data.length - 1]?.avgScore ?? 0
  const color = scoreColor(lastScore)

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <XAxis
          dataKey="day"
          tick={{ fill: '#666666', fontSize: 10, fontFamily: 'monospace' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          tickFormatter={(v: string) => v.slice(5)} // MM-DD
        />
        <YAxis
          domain={[0, 1]}
          tick={{ fill: '#666666', fontSize: 10, fontFamily: 'monospace' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => v.toFixed(1)}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0.75} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.3} />
        <ReferenceLine y={0.50} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.3} />
        <Line
          type="monotone"
          dataKey="avgScore"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, fill: color }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
