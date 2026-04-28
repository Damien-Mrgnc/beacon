export interface BeaconConfig {
    tenantId: string
    apiKey: string
    endpoint?: string
    flushInterval?: number
    batchSize?: number
    debug?: boolean
}

export interface BeaconEvent {
    type: string
    userId?: string
    properties?: Record<string, unknown>
    timestamp?: Date
}
