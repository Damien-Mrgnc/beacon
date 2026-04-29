type Tier = 'healthy' | 'at_risk' | 'critical'

const STYLES: Record<Tier, string> = {
  healthy:  'bg-healthy/10 text-healthy border-healthy/20',
  at_risk:  'bg-at-risk/10 text-at-risk border-at-risk/20',
  critical: 'bg-critical/10 text-critical border-critical/20',
}

const LABELS: Record<Tier, string> = {
  healthy:  'Healthy',
  at_risk:  'At Risk',
  critical: 'Critical',
}

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className={`
      inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border
      ${STYLES[tier]}
    `}>
      {LABELS[tier]}
    </span>
  )
}
