import Link from 'next/link'
import { api } from '@/lib/api'
import { TierBadge } from '@/components/ui/TierBadge'
import { ScoreBar } from '@/components/ui/ScoreBar'

export const revalidate = 30

export default async function AlertsPage() {
  const alerts = await api.alerts.list()

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
        <p className="text-sm text-muted mt-1">Tenants at churn risk — score below 0.40</p>
      </div>

      {alerts.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg px-6 py-20 text-center">
          <p className="text-2xl mb-2">✓</p>
          <p className="text-sm text-muted">No tenants in churn risk right now</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[2fr_3fr_130px_160px] px-6 py-3 border-b border-border bg-bg">
            {['Tenant', 'Score', 'Tier', 'Action'].map((h) => (
              <span key={h} className="text-[10px] text-muted uppercase tracking-widest font-mono">{h}</span>
            ))}
          </div>
          <div className="divide-y divide-border">
            {alerts.map((alert) => (
              <div
                key={alert.tenantId}
                className="grid grid-cols-[2fr_3fr_130px_160px] px-6 py-4 items-center hover:bg-surface-2 transition-colors"
              >
                <Link
                  href={`/tenants/${alert.tenantId}`}
                  className="text-sm font-mono font-medium hover:text-white transition-colors"
                >
                  {alert.tenantId}
                </Link>
                <div className="pr-8">
                  <ScoreBar score={alert.healthScore} />
                </div>
                <TierBadge tier={alert.tier} />
                <Link
                  href={`/insights/${alert.tenantId}`}
                  className="text-xs font-mono text-critical hover:underline underline-offset-2"
                >
                  AI Analysis →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
