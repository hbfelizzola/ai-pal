// The engine as ai-pal sees it from its edge: every hook registered here sits
// beneath the mod and stands for Claude Code (clock, store, network, session,
// notifications). Tests drive ai-pal only through these and read back only
// what you would see (the Pane, the band, notifications, command replies) or
// what ai-pal leaves in its store.
import { mock } from 'claude-code/testing'
import type { On, SessionRateLimit } from 'claude-code'

export const MIN = 60_000
export const H = 60 * MIN
export const DAY = 24 * H

/** Tue 17 Nov 2026, 14:00 local time. */
export const NOW = new Date(2026, 10, 17, 14, 0).getTime()

/** A local time on a day relative to NOW's day: at(0, 15, 20) is today 15:20. */
export const at = (dayOffset: number, hours: number, minutes = 0) =>
  new Date(2026, 10, 17 + dayOffset, hours, minutes).getTime()

export const iso = (ms: number) => new Date(ms).toISOString()

/** A Nudge's key: its window, Reset and lead time. */
export const nudgeKey = (window: 'five_hour' | 'seven_day', resetsAt: number, lead: '1h' | '24h' | '3h') =>
  `${window === 'five_hour' ? '5h' : 'wk'}-${iso(resetsAt).replace(/\D/g, '').slice(0, 12)}-${lead}`

export type Notified = { text: string; title?: string; key?: string; at?: number; untilBack?: boolean }
export type Reply = { status: number; body?: unknown; text?: string; headers?: Record<string, string> }

const PANE_PROPS = {
  title: 'ai-pal', isFocused: false, bodyColumns: 44, placement: 'dock',
  scroll: { offset: 0, bodyRows: 60 }, view: {},
} as const
const BAND_PROPS = {
  hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 110,
  scroll: { offset: 0, bodyRows: 10 }, view: {},
} as const

type Surface = 'terminal' | 'desktop'

/** A passive Reading as the session reports it: percent used and Reset. */
export const limit = (kind: 'five_hour' | 'seven_day', percentUsed: number, resetsAt: number): SessionRateLimit =>
  ({ kind, percentUsed, resetsAt: iso(resetsAt) })

/** The usage endpoint's `limits[]` reply. */
export function limitsReply(rows: {
  five?: [used: number, reset: number]
  week?: [used: number, reset: number]
  models?: { name: string; used: number; reset: number; share: number }[]
}) {
  const limits: unknown[] = []
  const shares: unknown[] = []
  if (rows.five) limits.push({ kind: 'session', group: 'session', percent: rows.five[0], severity: 'normal', resets_at: iso(rows.five[1] + 700), scope: null, is_active: true })
  if (rows.week) limits.push({ kind: 'weekly_all', group: 'weekly', percent: rows.week[0], severity: 'normal', resets_at: iso(rows.week[1] - 400), scope: null, is_active: true })
  for (const m of rows.models ?? []) {
    shares.push({ limit_index: limits.length, allowance_percent_of_weekly: m.share })
    limits.push({ kind: 'weekly_scoped', group: 'weekly', percent: m.used, severity: 'normal', resets_at: iso(m.reset), scope: { model: { display_name: m.name } }, is_active: true })
  }
  return { status: 200, body: { five_hour: null, seven_day: null, limits, weekly_scoped_shares: shares } }
}

/** All the text a drawing shows: Text children, labels, an Svg's alt and markup. */
export function shown(node: unknown): string {
  const out: string[] = []
  const walk = (n: unknown) => {
    if (typeof n === 'string') out.push(n)
    else if (typeof n === 'number') out.push(String(n))
    else if (Array.isArray(n)) n.forEach(walk)
    else if (n && typeof n === 'object') Object.entries(n).forEach(([k, v]) => k !== 'type' && walk(v))
  }
  walk(node)
  return out.join('\n')
}

export function engine(on: On, options: { now?: number; store?: Record<string, unknown> } = {}) {
  const clock = mock.clock(on, { now: options.now ?? NOW })
  const store = new Map<string, unknown>(Object.entries(options.store ?? {}))
  const notified: Notified[] = []
  const cancelled: string[] = []
  const fetches: { url: string; headers: Record<string, string>; auth?: string }[] = []
  const fetchTimes: number[] = []
  const opened: string[] = []
  const registered: string[] = []
  let rateLimits: SessionRateLimit[] = []
  let authorization: { handle: string; kind: 'bearer' } | null = null
  let replies: Reply[] = []
  let lastReply: Reply = { status: 500, text: '' }
  let replyDelay = 0

  const copy = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
  on('store.get', (_, e) => ({ value: copy(store.get(e.key)) }))
  on('store.set', (_, e) => (store.set(e.key, copy(e.value)), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('store.keys', () => ({ value: [...store.keys()] }))

  on('ui.open', (_, e) => (opened.push(e.id), { value: { isPlaced: true } }))
  on('command.register', (_, e) => (registered.push(e.name), { value: { command: e.name } }))
  on('ui.notify', (_, e) => (notified.push({ ...e }), { value: { isSent: true, channel: 'client' } }))
  on('ui.cancelNotify', (_, e) => (cancelled.push(e.key), { value: { isSent: true } }))
  on('settings.read', () => ({ value: { cleanupPeriodDays: 30 } }))
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { percent: null } as never, rateLimits },
  }))
  on('session.authorize', () => ({ value: authorization }))
  on('http.fetch', async (_, e) => {
    if (replyDelay) await clock.sleep(replyDelay)
    fetches.push({ url: e.url, headers: { ...(e.init?.headers ?? {}) }, auth: e.init?.auth })
    fetchTimes.push(clock.now())
    const r = replies.shift() ?? lastReply
    lastReply = r
    const text = r.text ?? JSON.stringify(r.body ?? {})
    return { value: { status: r.status, ok: r.status >= 200 && r.status < 300, headers: r.headers ?? {}, text } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  return {
    clock, store, notified, cancelled, fetches, fetchTimes, opened, registered,
    /** What `$.session.usage()` reports from now on. */
    setUsage(limits: SessionRateLimit[]) {
      rateLimits = limits
    },
    /** Signs the session in, so the usage endpoint can be reached. */
    signIn() {
      authorization = { handle: 'handle-1', kind: 'bearer' }
    },
    /** How long the endpoint takes to answer, on the mocked clock. */
    slowReplies(ms: number) {
      replyDelay = ms
    },
    /** The endpoint's next replies, in order; the last one repeats. */
    reply(...rs: Reply[]) {
      replies = rs
      if (rs.length) lastReply = rs[rs.length - 1]!
    },
    pane: { plugin: 'ai-pal', component: 'Pane', requestId: 'ai-pal', props: PANE_PROPS } as const,
    band: { plugin: 'ai-pal', component: 'AbovePrompt', props: BAND_PROPS } as const,
  }
}

export type World = ReturnType<typeof engine>
export const SURFACES: readonly Surface[] = ['terminal', 'desktop']
