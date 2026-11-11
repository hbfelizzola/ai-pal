export type Reading = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'ai-pal-readout-prototype': {
      variant: number
      scenario: number
      isBandOn: boolean
      live: Shaped<Reading[]>
      tick: number
    }
  }
}
