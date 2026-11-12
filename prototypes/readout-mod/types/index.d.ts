export type Reading = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'ai-pal-readout-prototype': {
      band: number
      isBandOn: boolean
      isStale: boolean
      isCountdown: boolean
      wording: number
      isBurnBelow: boolean
      scenario: number
      tick: number
      shownFive: number
      shownWeek: number
    }
  }
}
