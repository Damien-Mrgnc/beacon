# @beacon/sdk

> Beacon event tracking SDK — TypeScript client for ingesting product events.

---

## Install

```bash
npm install @beacon/sdk
# or
pnpm add @beacon/sdk
```

---

## Quickstart

```ts
import { BeaconSDK } from '@beacon/sdk'

const beacon = new BeaconSDK({
  tenantId: 'acme-corp',
  apiKey:   'sk-live-...',
})

beacon.track('user.login', { method: 'sso' })

// flush before process exit
await beacon.flush()
beacon.destroy()
```

---

## API

### `new BeaconSDK(config)`

| Option | Type | Default | Description |
|---|---|---|---|
| `tenantId` | `string` | required | Your tenant identifier |
| `apiKey` | `string` | required | Your API key |
| `endpoint` | `string` | `https://ingest.beacon.io` | Ingestion API base URL |
| `flushInterval` | `number` | `5000` | Auto-flush interval in ms |
| `batchSize` | `number` | `50` | Max events per batch request |
| `retries` | `number` | `2` | Retry attempts on 5xx / 429 |
| `debug` | `boolean` | `false` | Log debug output to console |

---

### `beacon.track(type, properties?)`

Track a product event.

```ts
beacon.track('feature.used', { feature: 'analytics', duration_ms: 4200 })
beacon.track('report.exported', { format: 'pdf', rows: 1500 })
beacon.track('api.call', { endpoint: '/v1/data', status: 200 })
```

Event types follow dot-notation: `<domain>.<action>`.

---

### `beacon.identify(userId, traits?)`

Associate a user ID with optional profile traits. Sends a `user.identify` event.

```ts
beacon.identify('user_42', {
  plan:    'enterprise',
  role:    'admin',
  company: 'Acme Corp',
})
```

---

### `beacon.flush()`

Immediately send all queued events. Returns the number of events sent.

```ts
// Graceful shutdown
process.on('SIGTERM', async () => {
  await beacon.flush()
  beacon.destroy()
  process.exit(0)
})
```

---

### `beacon.destroy()`

Stop the auto-flush timer and clear the event queue.

---

## Batching

Events are queued in memory and sent in batches to reduce network overhead:

- Auto-flush every `flushInterval` ms (default 5s)
- Immediate flush when the queue reaches `batchSize` events (default 50)
- Failed batches are retried with exponential backoff (200ms, 400ms)
- On persistent failure, events are re-queued at the front

---

## Self-hosted / custom endpoint

Point the SDK at your own ingestion service:

```ts
const beacon = new BeaconSDK({
  tenantId: 'acme-corp',
  apiKey:   'sk-live-...',
  endpoint: 'https://ingest.your-domain.com',
})
```

---

## Node.js example

```ts
import { BeaconSDK } from '@beacon/sdk'

const beacon = new BeaconSDK({
  tenantId: process.env.BEACON_TENANT_ID!,
  apiKey:   process.env.BEACON_API_KEY!,
  debug:    process.env.NODE_ENV !== 'production',
})

export async function onUserLogin(userId: string) {
  beacon.identify(userId, { logged_in_at: new Date().toISOString() })
  beacon.track('user.login', { source: 'api' })
}

export async function onFeatureUsed(userId: string, feature: string) {
  beacon.track('feature.used', { feature, user_id: userId })
}
```

## Browser example

```ts
import { BeaconSDK } from '@beacon/sdk'

const beacon = new BeaconSDK({
  tenantId: 'acme-corp',
  apiKey:   'sk-pub-...',
  endpoint: 'https://ingest.beacon.io',
})

// Track page views
document.addEventListener('DOMContentLoaded', () => {
  beacon.track('page.view', { path: window.location.pathname })
})

// Flush on page unload
window.addEventListener('beforeunload', () => {
  void beacon.flush()
})
```
