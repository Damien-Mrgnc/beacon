import Link from 'next/link'
import { api } from '@/lib/api'
import { ScoreBar } from '@/components/ui/ScoreBar'
import { TierBadge } from '@/components/ui/TierBadge'

export const revalidate = 60

function Trend({ current, prev }: { current: number; prev: number | null }) {
  if (!prev) return <span className="text-muted font-mono text-xs">—</span>
  const delta = current - prev
  const sign  = delta >= 0 ? '+' : ''
  const color = delta >= 0.01 ? 'text-healthy' : delta <= -0.01 ? 'text-critical' : 'text-muted'
  const arrow = delta >= 0.01 ? '↑' : delta <= -0.01 ? '↓' : '→'
  return (
    <span className={`font-mono text-xs tabular-nums ${color}`}>
      {arrow} {sign}{(delta * 100).toFixed(1)}%
    </span>
  )
}

export default async function OverviewPage() {
  const tenants = await api.tenant.list()

  const total    = tenants.length
  const healthy  = tenants.filter((t) => t.tier === 'healthy').length
  const atRisk   = tenants.filter((t) => t.tier === 'at_risk').length
  const critical = tenants.filter((t) => t.tier === 'critical').length

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted mt-1">Customer health across all tenants</p>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total',    value: total,    color: 'text-primary' },
          { label: 'Healthy',  value: healthy,  color: 'text-healthy' },
          { label: 'At Risk',  value: atRisk,   color: 'text-at-risk' },
          { label: 'Critical', value: critical, color: 'text-critical' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-surface border border-border rounded-lg px-5 py-4">
            <p className="text-[10px] text-muted uppercase tracking-widest font-mono mb-2">{label}</p>
            <p className={`text-3xl font-mono font-semibold tabular-nums ${color}`}>{value}</p>
            {total > 0 && label !== 'Total' && (
              <p className="text-xs text-muted mt-1 font-mono">
                {Math.round((value / total) * 100)}% of tenants
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Tenant table */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-medium">Tenants</h2>
          <span className="text-xs text-muted font-mono">{total} total</span>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[2fr_3fr_90px_130px_110px] px-6 py-2 border-b border-border bg-bg">
          {['Tenant', 'Health Score', 'Score', 'Tier', 'Events 7d'].map((h) => (
            <span key={h} className="text-[10px] text-muted uppercase tracking-widest font-mono">{h}</span>
          ))}
        </div>

        {tenants.length === 0 ? (
          <div className="px-6 py-20 text-center text-muted text-sm">
            No tenants. Start the ingestion service and send events.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tenants.map((tenant) => {
              const isCritical = tenant.tier === 'critical'
              return (
                <Link
                  key={tenant.tenantId}
                  href={`/tenants/${tenant.tenantId}`}
                  className={`grid grid-cols-[2fr_3fr_90px_130px_110px] px-6 py-4 items-center hover:brightness-125 transition-all group ${
                    isCritical ? 'bg-critical/5 border-l-2 border-l-critical' : ''
                  }`}
                >
                  <span className="text-sm font-mono font-medium group-hover:text-white transition-colors">
                    {tenant.tenantId}
                  </span>
                  <div className="pr-6">
                    <ScoreBar score={tenant.healthScore} />
                  </div>
                  <Trend current={tenant.healthScore} prev={tenant.score7dAgo} />
                  <TierBadge tier={tenant.tier} />
                  <span className="text-sm font-mono text-muted tabular-nums text-right">
                    {tenant.eventCount7d.toLocaleString()}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Critical banner */}
      {critical > 0 && (
        <div className="mt-4 flex items-center gap-2 px-4 py-3 bg-critical/10 border border-critical/30 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-critical animate-pulse shrink-0" />
          <span className="text-sm text-critical font-mono">
            {critical} tenant{critical > 1 ? 's' : ''} in critical state —
          </span>
          <Link href="/alerts" className="text-sm text-critical underline underline-offset-2 hover:opacity-80">
            view alerts →
          </Link>
        </div>
      )}
    </div>
  )
}
