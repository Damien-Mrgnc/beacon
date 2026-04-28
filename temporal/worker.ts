/**
 * Temporal worker — registers workflows and activities, then polls for tasks.
 *
 * Run with: pnpm worker
 * Requires Temporal server running on TEMPORAL_ADDRESS (default: localhost:7233)
 */

import { Worker, NativeConnection, Runtime, makeTelemetryFilterString } from '@temporalio/worker'
import * as activities from './activities'
import * as path from 'node:path'

const TEMPORAL_ADDRESS = process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233'
const TEMPORAL_NAMESPACE = process.env['TEMPORAL_NAMESPACE'] ?? 'default'
const TASK_QUEUE = process.env['TEMPORAL_TASK_QUEUE'] ?? 'beacon-main'

async function main() {
  // Configure OpenTelemetry-style logging
  Runtime.install({
    telemetryOptions: {
      logging: {
        filter: makeTelemetryFilterString({ core: 'WARN', other: 'INFO' }),
      },
    },
  })

  const connection = await NativeConnection.connect({ address: TEMPORAL_ADDRESS })

  const worker = await Worker.create({
    connection,
    namespace: TEMPORAL_NAMESPACE,
    taskQueue: TASK_QUEUE,
    // Temporal bundles workflow code separately (V8 sandbox)
    workflowsPath: path.resolve(__dirname, './workflows'),
    activities,
  })

  console.log(`[Temporal Worker] Listening on task queue: ${TASK_QUEUE}`)
  await worker.run()
}

main().catch((err) => {
  console.error('[Temporal Worker] Fatal error:', err)
  process.exit(1)
})
