/**
 * Notification activities — alerts, escalation tickets, account manager notifications.
 */

import { Pool } from 'pg'

const SLACK_WEBHOOK_URL = process.env['SLACK_WEBHOOK_URL'] ?? ''
const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://beacon:beacon@localhost:5432/beacon'

// Lazy-init pool — reused across activity calls in the same worker process
let _pool: Pool | null = null
function getPool(): Pool {
  if (!_pool) _pool = new Pool({ connectionString: DATABASE_URL })
  return _pool
}

export type AlertType = 'initial' | 'recovery' | 'escalation' | 'resolved'

/**
 * Send a churn risk alert via Slack webhook and persist to audit_logs.
 */
export async function sendChurnAlert(
  tenantId: string,
  score: number,
  alertType: AlertType,
): Promise<void> {
  const tier = score < 0.4 ? 'CRITICAL' : score < 0.6 ? 'AT_RISK' : 'RECOVERING'
  const emoji = tier === 'CRITICAL' ? '🔴' : tier === 'AT_RISK' ? '🟡' : '🟢'

  const message = `${emoji} *Beacon Alert* [${alertType.toUpperCase()}]\nTenant: \`${tenantId}\`\nScore: *${score.toFixed(3)}* (${tier})`

  // Slack webhook — no-op if not configured
  if (SLACK_WEBHOOK_URL) {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    })
    if (!res.ok) {
      throw new Error(`Slack webhook failed: ${res.status}`)
    }
  }

  // Persist to PostgreSQL for audit trail
  const pool = getPool()
  await pool.query(
    `INSERT INTO churn_alerts (tenant_id, score, alert_type, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT DO NOTHING`,
    [tenantId, score, alertType],
  )
}

/**
 * Create an escalation ticket in PostgreSQL when a tenant stays critical after 48h.
 */
export async function createEscalationTicket(tenantId: string, score: number): Promise<string> {
  const pool = getPool()
  const result = await pool.query<{ id: string }>(
    `INSERT INTO escalation_tickets (tenant_id, score, status, created_at)
     VALUES ($1, $2, 'open', NOW())
     RETURNING id`,
    [tenantId, score],
  )

  const ticketId = result.rows[0]!.id
  console.log(`[Temporal] Escalation ticket created: ${ticketId} for tenant ${tenantId}`)
  return ticketId
}

/**
 * Notify the account manager when a tenant stays critical after 7 days.
 */
export async function notifyAccountManager(tenantId: string, score: number): Promise<void> {
  const pool = getPool()

  // Fetch account manager email from tenant config
  const res = await pool.query<{ account_manager_email: string | null }>(
    `SELECT account_manager_email FROM tenants WHERE id = $1`,
    [tenantId],
  )

  const email = res.rows[0]?.account_manager_email
  if (!email) {
    console.warn(`[Temporal] No account manager found for tenant ${tenantId}`)
    return
  }

  // In production: send via SendGrid/SES. Here we log + persist.
  console.log(
    `[Temporal] ESCALATE → ${email} | tenant: ${tenantId} | score: ${score.toFixed(3)}`,
  )

  await pool.query(
    `UPDATE escalation_tickets
     SET status = 'escalated', escalated_at = NOW()
     WHERE tenant_id = $1 AND status = 'open'`,
    [tenantId],
  )
}
