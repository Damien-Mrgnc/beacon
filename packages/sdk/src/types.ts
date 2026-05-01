/** Configuration passed to `new BeaconSDK(config)`. */
export interface BeaconConfig {
  /** Your tenant ID (provided by Beacon). */
  tenantId: string
  /** Your API key (provided by Beacon). */
  apiKey: string
  /** Ingestion endpoint. Defaults to `https://ingest.beacon.io`. */
  endpoint?: string
  /**
   * How often (ms) the SDK auto-flushes queued events.
   * @default 5000
   */
  flushInterval?: number
  /**
   * Maximum number of events per batch request.
   * @default 50
   */
  batchSize?: number
  /**
   * Log debug information to the console.
   * @default false
   */
  debug?: boolean
  /**
   * Number of retry attempts on network failure.
   * @default 2
   */
  retries?: number
}

/** A single product event. */
export interface BeaconEvent {
  /** Event type in dot-notation, e.g. `"user.login"` or `"feature.used"`. */
  type: string
  /** ID of the user who triggered the event. */
  userId?: string
  /** Arbitrary key-value properties. All values must be JSON-serializable. */
  properties?: Record<string, unknown>
  /** Event timestamp. Defaults to `new Date()` if omitted. */
  timestamp?: Date
}

/** Shape of the batch payload sent to the ingestion API. */
export interface BatchPayload {
  events: Array<{
    type: string
    tenant_id: string
    user_id?: string
    properties?: Record<string, unknown>
    timestamp: string
  }>
}

/** Response from `POST /events/batch`. */
export interface BatchResponse {
  accepted: number
  batch_id: string
  ingested_at: string
}
