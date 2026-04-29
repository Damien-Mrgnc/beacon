import Link from 'next/link'
import { notFound } from 'next/navigation'
import { api } from '@/lib/api'
import { TierBadge } from '@/components/ui/TierBadge'
import { ScoreHistory } from '@/components/charts/ScoreHistory'

export const revalidate = 60

interface Props {
  params: { id: string }
}

const EVENT_COLORS: Record<string, string> = {
  'user.login':      'text-healthy',
  'api.call':        'text-at-risk',
  'feature.used':    'text-blue-400',
  'report.exported': 'text-purple-400',
  'page.view':       'text-muted',
}

export default async function TenantPage({ params }: Props) {
  const [tenant, history, events] = await Promise.all([
    api.tenant.getById(params.id),
    api.health.history(params.id, 30),
    api.events.live(params.id),
  ])

  if (!tenant) notFound()

  const tierColor =
    tenant.tier === 'healthy' ? 'text-healthy'
    : tenant.tier === 'at_risk' ? 'text-at-risk'
    : 'text-critical'

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted font-mono mb-6">
        <Link href="/" className="hover:text-primary transition-colors">Overview</Link>
        <span className="text-border">/</span>
        <span>{params.id}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold font-mono tracking-tight">{params.id}</h1>
          <TierBadge tier={tenant.tier} />
        </div>
        <Link
          href={`/insights/${params.id}`}
          className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-md text-sm font-mono hover:border-muted transition-colors"
        >
          AI Analysis →
        </Link>
      </div>

      {/* Score + History */}
      <div className="bg-surface border border-border rounded-lg p-6 mb-4">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[10px] text-muted uppercase tracking-widest font-mono mb-2">Health Score</p>
            <p className={`text-5xl font-mono font-semibold tabular-nums ${tierColor}`}>
              {tenant.healthScore.toFixed(3)}
            </p>
            <p className="text-xs text-muted font-mono mt-2">
              Last updated {new Date(tenant.computedAt).toLocaleString()}
            </p>
          </div>

          {/* Mini legend */}
          <div className="flex flex-col gap-1 text-xs font-mono text-muted text-right">
            <span className="text-healthy">▬ Healthy  ≥ 0.75</span>
            <span className="text-at-risk">▬ At Risk  ≥ 0.50</span>
            <span className="text-critical">▬ Critical  &lt; 0.50</span>
          </div>
        </div>

        {/* Chart */}
        <div>
          <p className="text-[10px] text-muted uppercase tracking-widest font-mono mb-3">30-day trend</p>
          <ScoreHistory data={history} />
        </div>
      </div>

      {/* Events feed */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-medium">Recent Events</h2>
          <span className="text-xs text-muted font-mono">last {events.length}</span>
        </div>

        {events.length === 0 ? (
          <p className="px-6 py-12 text-center text-muted text-sm">No recent events</p>
        ) : (
          <div className="divide-y divide-border">
            {/* Column headers */}
            <div className="grid grid-cols-[2fr_2fr_1fr] px-6 py-2 bg-bg">
              {['Event Type', 'User', 'Time'].map((h) => (
                <span key={h} className="text-[10px] text-muted uppercase tracking-widest font-mono">{h}</span>
              ))}
            </div>
            {events.map((ev) => (
              <div
                key={ev.eventId}
                className="grid grid-cols-[2fr_2fr_1fr] px-6 py-3 text-xs font-mono hover:bg-surface-2 transition-colors"
              >
                <span className={EVENT_COLORS[ev.eventType] ?? 'text-primary'}>{ev.eventType}</span>
                <span className="text-muted">{ev.userId}</span>
                <span className="text-muted text-right">
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
