declare module 'claude-code' {
  interface PluginState {
    'ai-pal-readout-prototype': {
      layout: number
      isTimeBars: boolean
      scenario: number
      tick: number
      shownFive: number
      shownWeek: number
    }
  }
}
export type Layout = number
