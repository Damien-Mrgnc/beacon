interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  accent?: 'healthy' | 'at-risk' | 'critical' | 'default'
}

const ACCENT_COLOR = {
  healthy:  'text-healthy',
  'at-risk': 'text-at-risk',
  critical:  'text-critical',
  default:   'text-primary',
}

export function StatCard({ label, value, sub, accent = 'default' }: StatCardProps) {
  return (
    <div className="bg-surface border border-border rounded-lg p-5 flex flex-col gap-2">
      <p className="text-xs text-muted uppercase tracking-wider font-mono">{label}</p>
      <p className={`text-3xl font-mono font-medium tabular-nums ${ACCENT_COLOR[accent]}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  )
}
