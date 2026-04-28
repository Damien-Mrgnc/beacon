// M02 — full implementation coming in next sprint
import type { BeaconConfig, BeaconEvent } from './types'

export class BeaconSDK {
    constructor(private readonly config: BeaconConfig) {}

    async track(_type: string, _properties?: Record<string, unknown>): Promise<void> {
        // TODO: implement in M02
    }

    async identify(_userId: string, _traits?: Record<string, unknown>): Promise<void> {
        // TODO: implement in M02
    }

    async flush(): Promise<void> {
        // TODO: implement in M02
    }

    destroy(): void {
        // TODO: implement in M02
    }
}
