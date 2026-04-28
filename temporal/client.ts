/**
 * Temporal client — used by external services (e.g. Stream Processor)
 * to start workflows without importing the full worker.
 */

import { Client, Connection } from '@temporalio/client'
import { ChurnRiskWorkflow, type ChurnRiskInput } from './workflows/churnRisk'
import { HealthCheckWorkflow, type HealthCheckInput } from './workflows/healthCheck'

const TEMPORAL_ADDRESS = process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233'
const TEMPORAL_NAMESPACE = process.env['TEMPORAL_NAMESPACE'] ?? 'default'
export const TASK_QUEUE = process.env['TEMPORAL_TASK_QUEUE'] ?? 'beacon-main'

async function getClient(): Promise<Client> {
  const connection = await Connection.connect({ address: TEMPORAL_ADDRESS })
  return new Client({ connection, namespace: TEMPORAL_NAMESPACE })
}

/**
 * Start a ChurnRisk workflow for a tenant.
 * Idempotent — uses tenantId as workflowId prefix to prevent duplicates.
 */
export async function startChurnRiskWorkflow(input: ChurnRiskInput): Promise<string> {
  const client = await getClient()
  const workflowId = `churn-risk-${input.tenantId}`

  const handle = await client.workflow.start(ChurnRiskWorkflow, {
    taskQueue: TASK_QUEUE,
    workflowId,
    args: [input],
    // If a workflow already runs for this tenant, skip
    workflowIdReusePolicy: 'TERMINATE_IF_RUNNING',
  })

  return handle.workflowId
}

/**
 * Start a one-off HealthCheck for a specific tenant.
 */
export async function startHealthCheckWorkflow(input: HealthCheckInput): Promise<string> {
  const client = await getClient()
  const workflowId = `health-check-${input.tenantId}-${Date.now()}`

  const handle = await client.workflow.start(HealthCheckWorkflow, {
    taskQueue: TASK_QUEUE,
    workflowId,
    args: [input],
  })

  return handle.workflowId
}
