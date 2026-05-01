import type { BatchPayload, BatchResponse, BeaconConfig, BeaconEvent } from './types'

const DEFAULT_ENDPOINT = 'https://ingest.beacon.io'
const DEFAULT_FLUSH_INTERVAL = 5_000
const DEFAULT_BATCH_SIZE = 50
const DEFAULT_RETRIES = 2

/**
 * BeaconSDK — lightweight event tracking client for Beacon.
 *
 * Events are queued in memory and sent in batches to reduce network overhead.
 * The queue is flushed automatically every `flushInterval` ms or when it
 * reaches `batchSize` events.
 *
 * @example
 * ```ts
 * const beacon = new BeaconSDK({
 *   tenantId: 'acme-corp',
 *   apiKey:   'sk-live-...',
 * })
 *
 * beacon.track('user.login', { method: 'sso' })
 * beacon.identify('user_42', { plan: 'enterprise' })
 *
 * // Flush remaining events before process exit
 * await beacon.flush()
 * beacon.destroy()
 * ```
 */
export class BeaconSDK {
  private readonly config: Required<BeaconConfig>
  private queue: BeaconEvent[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private timer: any = null

  constructor(config: BeaconConfig) {
    this.config = {
      endpoint:      config.endpoint      ?? DEFAULT_ENDPOINT,
      flushInterval: config.flushInterval ?? DEFAULT_FLUSH_INTERVAL,
      batchSize:     config.batchSize     ?? DEFAULT_BATCH_SIZE,
      debug:         config.debug         ?? false,
      retries:       config.retries       ?? DEFAULT_RETRIES,
      tenantId:      config.tenantId,
      apiKey:        config.apiKey,
    }
    this.startAutoFlush()
  }

  /**
   * Track a product event.
   *
   * @param type - Event type in dot-notation (e.g. `"feature.used"`, `"report.exported"`).
   * @param properties - Optional key-value payload attached to the event.
   *
   * @example
   * ```ts
   * beacon.track('feature.used', { feature: 'analytics-dashboard', duration_ms: 4200 })
   * ```
   */
  track(type: string, properties?: Record<string, unknown>): void {
    const event: BeaconEvent = { type }
    if (properties !== undefined) event.properties = properties
    this.enqueue(event)
  }

  /**
   * Identify a user and associate traits with their profile.
   * Sends a `"user.identify"` event under the hood.
   *
   * @param userId - Unique identifier for the user in your system.
   * @param traits - Optional user attributes (plan, role, company, …).
   *
   * @example
   * ```ts
   * beacon.identify('user_42', { plan: 'enterprise', role: 'admin' })
   * ```
   */
  identify(userId: string, traits?: Record<string, unknown>): void {
    const event: BeaconEvent = { type: 'user.identify', userId }
    if (traits !== undefined) event.properties = traits
    this.enqueue(event)
  }

  /**
   * Immediately send all queued events to the ingestion API.
   * Call this before process exit or page unload to avoid event loss.
   *
   * @returns The number of events successfully sent.
   *
   * @example
   * ```ts
   * process.on('SIGTERM', async () => {
   *   await beacon.flush()
   *   beacon.destroy()
   * })
   * ```
   */
  async flush(): Promise<number> {
    if (this.queue.length === 0) return 0

    const batch = this.queue.splice(0, this.config.batchSize)
    try {
      await this.sendBatch(batch)
      this.log(`Flushed ${batch.length} events`)
      return batch.length
    } catch (err) {
      // Put events back at the front of the queue on failure
      this.queue.unshift(...batch)
      this.log(`Flush failed — ${batch.length} events re-queued: ${err}`)
      return 0
    }
  }

  /**
   * Stop the auto-flush timer and clear the internal queue.
   * Call this when you no longer need the SDK instance.
   */
  destroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.queue = []
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private enqueue(event: BeaconEvent): void {
    this.queue.push({ ...event, timestamp: event.timestamp ?? new Date() })
    if (this.queue.length >= this.config.batchSize) {
      void this.flush()
    }
  }

  private startAutoFlush(): void {
    this.timer = setInterval(() => {
      void this.flush()
    }, this.config.flushInterval)
    // In Node.js, prevent the timer from blocking process exit
    if (typeof this.timer === 'object' && this.timer !== null && 'unref' in this.timer) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.timer.unref()
    }
  }

  private async sendBatch(events: BeaconEvent[], attempt = 0): Promise<BatchResponse> {
    const payload: BatchPayload = {
      events: events.map(e => {
        const entry: BatchPayload['events'][number] = {
          type:      e.type,
          tenant_id: this.config.tenantId,
          timestamp: (e.timestamp ?? new Date()).toISOString(),
        }
        if (e.userId !== undefined)    entry.user_id    = e.userId
        if (e.properties !== undefined) entry.properties = e.properties
        return entry
      }),
    }

    const res = await fetch(`${this.config.endpoint}/events/batch`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key':    this.config.apiKey,
        'x-tenant-id':  this.config.tenantId,
        'x-sdk-version': '__SDK_VERSION__',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const isRetryable = res.status >= 500 || res.status === 429
      if (isRetryable && attempt < this.config.retries) {
        const delay = 200 * 2 ** attempt   // 200ms, 400ms
        await new Promise(r => setTimeout(r, delay))
        return this.sendBatch(events, attempt + 1)
      }
      throw new Error(`HTTP ${res.status}`)
    }

    return res.json() as Promise<BatchResponse>
  }

  private log(msg: string): void {
    if (this.config.debug) console.debug(`[beacon-sdk] ${msg}`)
  }
}
