/**
 * HealthCheckWorkflow — periodic health score recalculation for a single tenant.
 *
 * Run every hour via Temporal schedule (configured in worker.ts).
 * Triggers ChurnRiskWorkflow as a child workflow if score drops below threshold.
 */

import { proxyActivities, log, startChild, workflowInfo } from '@temporalio/workflow'
import type * as activities from '../activities'
import { ChurnRiskWorkflow, CHURN_THRESHOLD } from './churnRisk'

const { getHealthScore, sendChurnAlert } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 3, initialInterval: '1s', backoffCoefficient: 2 },
})

export interface HealthCheckInput {
  tenantId: string
}

export async function HealthCheckWorkflow({ tenantId }: HealthCheckInput): Promise<void> {
  const { workflowId } = workflowInfo()
  log.info('HealthCheck running', { tenantId, workflowId })

  const score = await getHealthScore(tenantId)

  if (score === null) {
    log.info('No score available — skipping', { tenantId })
    return
  }

  log.info('Score fetched', { tenantId, score })

  if (score < CHURN_THRESHOLD) {
    // Spawn ChurnRisk as a child workflow — tracked independently
    await startChild(ChurnRiskWorkflow, {
      workflowId: `churn-risk-${tenantId}-${Date.now()}`,
      args: [{ tenantId, initialScore: score }],
    })
    log.warn('ChurnRisk child workflow started', { tenantId, score })
  } else if (score >= 0.55) {
    // Previously at-risk but now recovered — send recovery signal
    await sendChurnAlert(tenantId, score, 'recovery')
  }
}
