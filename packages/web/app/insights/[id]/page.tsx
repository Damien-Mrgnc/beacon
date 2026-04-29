import Link from 'next/link'

interface RiskFactor {
  signal: string
  severity: string
  description: string
}

interface RecommendedAction {
  priority: number
  action: string
  rationale: string
}

interface ChurnInsight {
  health_score: number
  confidence: number
  model_used: string
  diagnosis: string
  risk_factors: RiskFactor[]
  recommended_actions: RecommendedAction[]
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-critical/30 bg-critical/5 text-critical',
  high:     'border-at-risk/30 bg-at-risk/5 text-at-risk',
  medium:   'border-border bg-surface-2 text-muted',
  low:      'border-border bg-surface text-muted',
}

const PRIORITY_LABEL: Record<number, string> = {
  1: 'Urgent',
  2: 'High',
  3: 'Normal',
}

const PRIORITY_COLOR: Record<number, string> = {
  1: 'text-critical',
  2: 'text-at-risk',
  3: 'text-muted',
}

interface Props {
  params: { id: string }
}

async function fetchInsight(tenantId: string): Promise<ChurnInsight | null> {
  const url = process.env['AI_SERVICE_URL'] ?? 'http://localhost:8002'
  try {
    const res = await fetch(`${url}/insights/${tenantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId, force_refresh: false }),
      next: { revalidate: 1800 },
    })
    if (!res.ok) return null
    return res.json() as Promise<ChurnInsight>
  } catch {
    return null
  }
}

export default async function InsightsPage({ params }: Props) {
  const insight = await fetchInsight(params.id)

  return (
    <div className="px-10 py-10 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted font-mono mb-8">
        <Link href="/" className="hover:text-primary transition-colors">Overview</Link>
        <span>/</span>
        <Link href={`/tenants/${params.id}`} className="hover:text-primary transition-colors">{params.id}</Link>
        <span>/</span>
        <span className="text-primary">AI Analysis</span>
      </div>

      <div className="mb-8">
        <h1 className="text-xl font-medium">AI Analysis</h1>
        <p className="text-sm text-muted mt-1 font-mono">{params.id}</p>
      </div>

      {!insight ? (
        <div className="bg-surface border border-border rounded-lg p-10 text-center">
          <p className="text-muted text-sm mb-2">AI service unavailable</p>
          <p className="text-xs text-subtle font-mono">Start the beacon-ai service on port 8002</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Header metrics */}
          <div className="flex items-center gap-4 bg-surface border border-border rounded-lg px-6 py-4">
            <div>
              <p className="text-xs text-muted font-mono uppercase tracking-wider mb-1">Health Score</p>
              <p className="text-2xl font-mono font-medium">{insight.health_score?.toFixed(3)}</p>
            </div>
            <div className="w-px h-10 bg-border mx-2" />
            <div>
              <p className="text-xs text-muted font-mono uppercase tracking-wider mb-1">Confidence</p>
              <p className="text-2xl font-mono font-medium">{Math.round(insight.confidence * 100)}%</p>
            </div>
            <div className="w-px h-10 bg-border mx-2" />
            <div>
              <p className="text-xs text-muted font-mono uppercase tracking-wider mb-1">Model</p>
              <p className="text-sm font-mono text-muted">{insight.model_used}</p>
            </div>
          </div>

          {/* Diagnosis */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <p className="text-xs text-muted uppercase tracking-wider font-mono mb-3">Diagnosis</p>
            <p className="text-sm text-primary leading-relaxed">{insight.diagnosis}</p>
          </div>

          {/* Risk factors */}
          <div>
            <p className="text-xs text-muted uppercase tracking-wider font-mono mb-3">Risk Factors</p>
            <div className="space-y-2">
              {insight.risk_factors?.map((rf: RiskFactor, i: number) => (
                <div
                  key={i}
                  className={`border rounded-lg px-5 py-4 ${SEVERITY_STYLE[rf.severity] ?? SEVERITY_STYLE.low}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">{rf.signal}</p>
                    <span className="text-xs font-mono uppercase tracking-wider opacity-70">
                      {rf.severity}
                    </span>
                  </div>
                  <p className="text-xs opacity-80">{rf.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <p className="text-xs text-muted uppercase tracking-wider font-mono mb-3">Recommended Actions</p>
            <div className="space-y-2">
              {insight.recommended_actions?.map((action: RecommendedAction, i: number) => (
                <div key={i} className="bg-surface border border-border rounded-lg px-5 py-4">
                  <div className="flex items-start gap-4">
                    <span className={`text-xs font-mono uppercase tracking-wider mt-0.5 shrink-0 ${PRIORITY_COLOR[action.priority]}`}>
                      {PRIORITY_LABEL[action.priority]}
                    </span>
                    <div>
                      <p className="text-sm text-primary mb-1">{action.action}</p>
                      <p className="text-xs text-muted">{action.rationale}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
