export type Layout = number

declare module 'claude-code' {
  interface PluginState {
    'ai-pal-readout-prototype': {
      layout: number
      isBandOn: boolean
      isStale: boolean
      scenario: number
      tick: number
    }
  }
}
