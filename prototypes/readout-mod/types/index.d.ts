export type Reading = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'ai-pal-readout-prototype': {
      variant: number
      scenario: number
      tick: number
      shownFive: number
      shownWeek: number
    }
  }
}
