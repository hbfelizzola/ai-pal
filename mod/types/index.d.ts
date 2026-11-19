// ai-pal's $.state contract: values a drawing reads, held for the session.

/** What the usage endpoint is doing in this session, for the footnote. */
export type EndpointState =
  | { state: 'unknown' }
  | { state: 'ok' }
  /** Busy (429 or 5xx): retrying at `until`. */
  | { state: 'backoff'; status: number; until: number }
  /** Refused (401/403 or no credential) or unreadable: off until a new session. */
  | { state: 'off'; why: 'refused' | 'unreadable' }

declare module 'claude-code' {
  interface PluginState {
    'ai-pal': {
      /** Bumped whenever what the readout draws from may have changed. */
      rev: number
      endpoint: EndpointState
      /** Ticks every second for the dials' countdown clocks. */
      second: number
    }
  }
}
