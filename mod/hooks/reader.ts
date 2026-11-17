// The Usage reader: turns the two sources into Readings.
//
// Passive: the session's own `rateLimits` (five_hour, seven_day), fresh as of
// its last response. Active: the plan's usage endpoint, polled every 5 min,
// `limits[]` first and the legacy keys as fallback; only it reports
// model-specific weekly windows.
import type { HttpResponse, SessionRateLimit } from 'claude-code'
import type { EndpointState } from '../types'
import type { Reading, Source, WindowId } from './log'
import { MIN, snap } from './time'

export const ENDPOINT = 'https://api.anthropic.com/api/oauth/usage'
export const ENDPOINT_HEADERS = { 'anthropic-beta': 'oauth-2025-04-20' }
export const POLL_EVERY = 5 * MIN
const MAX_WAIT = 60 * MIN

const reading = (source: Source, now: number, used: unknown, resets: unknown, share?: number): Reading | undefined => {
  if (typeof used !== 'number' || !Number.isFinite(used) || typeof resets !== 'string') return undefined
  const resetsAt = Date.parse(resets)
  if (!Number.isFinite(resetsAt)) return undefined
  const left = Math.max(0, Math.round((100 - used) * 10) / 10)
  return { at: now, source, left, resetsAt: snap(resetsAt), ...(share === undefined ? {} : { share }) }
}

/** The session's own figures, as `$.session.usage()` and `session.measure` report them. */
export function passiveReadings(limits: readonly SessionRateLimit[], now: number): [WindowId, Reading][] {
  const out: [WindowId, Reading][] = []
  for (const l of limits) {
    if (l.kind !== 'five_hour' && l.kind !== 'seven_day') continue
    const r = reading('session', now, l.percentUsed, l.resetsAt)
    if (r) out.push([l.kind, r])
  }
  return out
}

type Row = { kind?: unknown; percent?: unknown; resets_at?: unknown; scope?: { model?: { display_name?: unknown } } | null }
type Share = { limit_index?: unknown; allowance_percent_of_weekly?: unknown }

/** The endpoint's body as Readings, or undefined when neither shape parses. */
export function endpointReadings(body: string, now: number): [WindowId, Reading][] | undefined {
  let json: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object') return undefined
    json = parsed as Record<string, unknown>
  } catch {
    return undefined
  }
  const out: [WindowId, Reading][] = []
  if (Array.isArray(json.limits)) {
    const shares = Array.isArray(json.weekly_scoped_shares) ? (json.weekly_scoped_shares as Share[]) : []
    json.limits.forEach((row: Row, i) => {
      if (!row || typeof row !== 'object') return
      if (row.kind === 'session' || row.kind === 'weekly_all') {
        const r = reading('api', now, row.percent, row.resets_at)
        if (r) out.push([row.kind === 'session' ? 'five_hour' : 'seven_day', r])
      } else if (row.kind === 'weekly_scoped') {
        const name = row.scope?.model?.display_name
        const share = shares.find(s => s?.limit_index === i)?.allowance_percent_of_weekly
        if (typeof name !== 'string' || !name) return
        const r = reading('api', now, row.percent, row.resets_at, typeof share === 'number' ? share : undefined)
        if (r) out.push([`model:${name}`, r])
      }
    })
    if (out.length) return out
  }
  for (const [key, id] of [['five_hour', 'five_hour'], ['seven_day', 'seven_day']] as const) {
    const legacy = json[key] as { utilization?: unknown; resets_at?: unknown } | null | undefined
    const r = legacy && reading('api', now, legacy.utilization, legacy.resets_at)
    if (r) out.push([id, r])
  }
  return out.length ? out : undefined
}

/** How long a busy endpoint asks us to wait, from Retry-After (seconds or a date). */
function retryAfter(headers: Record<string, string>, now: number): number | undefined {
  const v = headers['retry-after']
  if (!v) return undefined
  const s = Number(v)
  if (Number.isFinite(s)) return Math.max(0, s * 1000)
  const t = Date.parse(v)
  return Number.isFinite(t) ? Math.max(0, t - now) : undefined
}

/** The poller's own memory: the wait it is on. */
export type Poller = { wait: number }
export const newPoller = (): Poller => ({ wait: POLL_EVERY })

export type PollOutcome = {
  readings: [WindowId, Reading][]
  state: EndpointState
  /** When to ask again; absent once the endpoint is off. */
  nextIn?: number
}

/** What one reply means: Readings, the endpoint's state and when to ask again. */
export function onReply(poller: Poller, reply: HttpResponse, now: number): PollOutcome {
  if (reply.status === 401 || reply.status === 403) return { readings: [], state: { state: 'off', why: 'refused' } }
  if (reply.status === 429 || reply.status >= 500) {
    const asked = retryAfter(reply.headers, now)
    let nextIn: number
    if (asked !== undefined) nextIn = Math.min(asked, MAX_WAIT)
    else nextIn = poller.wait = Math.min(poller.wait * 2, MAX_WAIT)
    return { readings: [], state: { state: 'backoff', status: reply.status, until: now + nextIn }, nextIn }
  }
  const readings = reply.ok ? endpointReadings(reply.text, now) : undefined
  if (!readings) return { readings: [], state: { state: 'off', why: 'unreadable' } }
  poller.wait = POLL_EVERY
  return { readings, state: { state: 'ok' }, nextIn: POLL_EVERY }
}

/** A request that failed to send at all counts as busy. */
export const onFailure = (poller: Poller, now: number): PollOutcome =>
  onReply(poller, { status: 503, ok: false, headers: {}, text: '' }, now)

