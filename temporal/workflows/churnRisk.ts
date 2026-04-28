/**
 * ChurnRiskWorkflow — orchestrates the full churn recovery sequence.
 *
 * Triggered when a tenant's health score drops below 0.40.
 * The workflow runs for up to 9 days and handles:
 *   1. Immediate alert
 *   2. 48h reassessment → escalation ticket if still critical
 *   3. 7d final escalation → notify account manager
 *
 * All time operations use Temporal's deterministic sleep() — the workflow
 * survives worker restarts without losing state.
 */

import { proxyActivities, sleep, log } from '@temporalio/workflow'
import type * as activities from '../activities'

const { getHealthScore, sendChurnAlert, createEscalationTicket, notifyAccountManager } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '30 seconds',
    retry: {
      maximumAttempts: 3,
      initialInterval: '1s',
      backoffCoefficient: 2,
      maximumInterval: '30s',
    },
  })

export const CHURN_THRESHOLD = 0.40
export const RECOVERY_THRESHOLD = 0.55

export interface ChurnRiskInput {
  tenantId: string
  initialScore: number
}

export async function ChurnRiskWorkflow({ tenantId, initialScore }: ChurnRiskInput): Promise<void> {
  log.info('ChurnRisk started', { tenantId, initialScore })

  // Step 1 — immediate alert
  await sendChurnAlert(tenantId, initialScore, 'initial')

  // Step 2 — reassess after 48h
  await sleep('48 hours')
  const score48h = await getHealthScore(tenantId)

  if (score48h === null) {
    log.warn('No score found at 48h — tenant may have no recent events', { tenantId })
    return
  }

  if (score48h >= RECOVERY_THRESHOLD) {
    log.info('Tenant recovered at 48h', { tenantId, score: score48h })
    await sendChurnAlert(tenantId, score48h, 'recovery')
    return
  }

  // Step 3 — still critical → escalation ticket
  log.warn('Still critical at 48h — creating escalation ticket', { tenantId, score: score48h })
  await createEscalationTicket(tenantId, score48h)

  // Step 4 — final check after 7 days
  await sleep('7 days')
  const score7d = await getHealthScore(tenantId)

  if (score7d === null || score7d >= RECOVERY_THRESHOLD) {
    log.info('Tenant resolved or recovered at 7d', { tenantId, score: score7d })
    if (score7d !== null) await sendChurnAlert(tenantId, score7d, 'resolved')
    return
  }

  // Step 5 — escalate to account manager
  log.error('Tenant still critical after 7 days — escalating', { tenantId, score: score7d })
  await notifyAccountManager(tenantId, score7d)
}
