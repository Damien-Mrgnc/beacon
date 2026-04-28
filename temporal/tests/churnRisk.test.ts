/**
 * ChurnRiskWorkflow tests — no Temporal server required.
 *
 * Strategy: mock @temporalio/workflow so the workflow function runs as plain
 * async code. Activities are mocked with vi.fn(). This tests the business
 * logic (branching, escalation conditions) without any network or binary deps.
 *
 * vi.hoisted() is required because vi.mock() factories are hoisted to the top
 * of the file before variable declarations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Declare mocks before hoisting ────────────────────────────────────────────
const {
  mockSleep,
  mockLog,
  mockGetHealthScore,
  mockSendChurnAlert,
  mockCreateEscalationTicket,
  mockNotifyAccountManager,
  mockGetAllTenantIds,
} = vi.hoisted(() => ({
  mockSleep: vi.fn().mockResolvedValue(undefined),
  mockLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockGetHealthScore: vi.fn(),
  mockSendChurnAlert: vi.fn().mockResolvedValue(undefined),
  mockCreateEscalationTicket: vi.fn().mockResolvedValue('ticket-001'),
  mockNotifyAccountManager: vi.fn().mockResolvedValue(undefined),
  mockGetAllTenantIds: vi.fn().mockResolvedValue([]),
}))

// ── Mock @temporalio/workflow ────────────────────────────────────────────────
// proxyActivities receives options (timeout, retry), NOT the activity functions.
// We return the mocks directly so the workflow destructuring works correctly.
vi.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({
    getHealthScore: (...args: unknown[]) => mockGetHealthScore(...args),
    sendChurnAlert: (...args: unknown[]) => mockSendChurnAlert(...args),
    createEscalationTicket: (...args: unknown[]) => mockCreateEscalationTicket(...args),
    notifyAccountManager: (...args: unknown[]) => mockNotifyAccountManager(...args),
    getAllTenantIds: (...args: unknown[]) => mockGetAllTenantIds(...args),
  }),
  sleep: mockSleep,
  log: mockLog,
  startChild: vi.fn().mockResolvedValue(undefined),
  workflowInfo: vi.fn().mockReturnValue({ workflowId: 'test-wf-001' }),
}))

// ── Mock activities ──────────────────────────────────────────────────────────
vi.mock('../activities', () => ({
  getHealthScore: (...args: unknown[]) => mockGetHealthScore(...args),
  sendChurnAlert: (...args: unknown[]) => mockSendChurnAlert(...args),
  createEscalationTicket: (...args: unknown[]) => mockCreateEscalationTicket(...args),
  notifyAccountManager: (...args: unknown[]) => mockNotifyAccountManager(...args),
  getAllTenantIds: (...args: unknown[]) => mockGetAllTenantIds(...args),
}))

// ── Import workflow AFTER mocks ───────────────────────────────────────────────
import { ChurnRiskWorkflow, CHURN_THRESHOLD, RECOVERY_THRESHOLD } from '../workflows/churnRisk'

const BASE_INPUT = { tenantId: 'acme-corp', initialScore: 0.25 }

describe('ChurnRiskWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSleep.mockResolvedValue(undefined)
    mockSendChurnAlert.mockResolvedValue(undefined)
    mockCreateEscalationTicket.mockResolvedValue('ticket-001')
    mockNotifyAccountManager.mockResolvedValue(undefined)
  })

  it('sends initial alert immediately', async () => {
    mockGetHealthScore.mockResolvedValue(RECOVERY_THRESHOLD + 0.1)
    await ChurnRiskWorkflow(BASE_INPUT)
    expect(mockSendChurnAlert).toHaveBeenCalledWith('acme-corp', 0.25, 'initial')
  })

  it('sends recovery alert when score recovers at 48h', async () => {
    mockGetHealthScore.mockResolvedValue(RECOVERY_THRESHOLD + 0.1)
    await ChurnRiskWorkflow(BASE_INPUT)
    const alertTypes = mockSendChurnAlert.mock.calls.map((c) => c[2])
    expect(alertTypes).toContain('initial')
    expect(alertTypes).toContain('recovery')
    expect(mockCreateEscalationTicket).not.toHaveBeenCalled()
  })

  it('creates escalation ticket when still critical at 48h', async () => {
    mockGetHealthScore
      .mockResolvedValueOnce(CHURN_THRESHOLD - 0.05) // still critical at 48h
      .mockResolvedValueOnce(RECOVERY_THRESHOLD + 0.1) // recovered at 7d
    await ChurnRiskWorkflow(BASE_INPUT)
    expect(mockCreateEscalationTicket).toHaveBeenCalledWith('acme-corp', expect.any(Number))
  })

  it('notifies account manager when still critical after 7 days', async () => {
    mockGetHealthScore
      .mockResolvedValueOnce(CHURN_THRESHOLD - 0.05) // still critical at 48h
      .mockResolvedValueOnce(CHURN_THRESHOLD - 0.05) // still critical at 7d
    await ChurnRiskWorkflow(BASE_INPUT)
    expect(mockNotifyAccountManager).toHaveBeenCalledWith('acme-corp', expect.any(Number))
  })

  it('stops early when score is null at 48h', async () => {
    mockGetHealthScore.mockResolvedValue(null)
    await ChurnRiskWorkflow(BASE_INPUT)
    const alertTypes = mockSendChurnAlert.mock.calls.map((c) => c[2])
    expect(alertTypes).toEqual(['initial'])
    expect(mockCreateEscalationTicket).not.toHaveBeenCalled()
  })

  it('does not create ticket when score is at or above recovery threshold at 48h', async () => {
    // RECOVERY_THRESHOLD = 0.55 — any score >= 0.55 means recovered, no ticket
    mockGetHealthScore.mockResolvedValue(RECOVERY_THRESHOLD)
    await ChurnRiskWorkflow(BASE_INPUT)
    expect(mockCreateEscalationTicket).not.toHaveBeenCalled()
  })

  it('calls sleep twice — 48h then 7 days', async () => {
    mockGetHealthScore
      .mockResolvedValueOnce(CHURN_THRESHOLD - 0.05)
      .mockResolvedValueOnce(CHURN_THRESHOLD - 0.05)
    await ChurnRiskWorkflow(BASE_INPUT)
    expect(mockSleep).toHaveBeenCalledWith('48 hours')
    expect(mockSleep).toHaveBeenCalledWith('7 days')
    expect(mockSleep).toHaveBeenCalledTimes(2)
  })
})
