// The Reading log: every Usage Window's Readings, kept in $.store so every
// session (and v2's Lost Allowance history) reads the same figures.
//
// $.store has no atomic get-then-set across sessions, so every write is a
// merge by Reading time, never an overwrite, and each session re-merges its
// own recent Readings on every write: a write another session clobbered comes
// back on this session's next one.
import type { EngineInterface } from 'claude-code'
import { DAY, H } from './time'

export type WindowId = 'five_hour' | 'seven_day' | `model:${string}`
export type Source = 'session' | 'api'

export type Reading = {
  /** When it was read. */
  at: number
  source: Source
  /** Unused Allowance, % of the window's own cap. */
  left: number
  /** The Reset, snapped to the minute. */
  resetsAt: number
  /** Model-specific windows: their `allowance_percent_of_weekly`. */
  share?: number
}

export type Log = ReadonlyMap<WindowId, readonly Reading[]>

const PREFIX = 'readings:'
const keep = (id: WindowId) => (id === 'five_hour' ? 7 * DAY : 28 * DAY)

/** This session's own Readings of the last hour, re-merged on every write. */
const mine = new Map<WindowId, Reading[]>()

const same = (a: Reading, b: Reading) => a.left === b.left && a.resetsAt === b.resetsAt && a.share === b.share

function merge(id: WindowId, now: number, ...lists: readonly (readonly Reading[] | undefined)[]): Reading[] {
  const byKey = new Map<string, Reading>()
  for (const list of lists) for (const r of list ?? []) byKey.set(`${r.at}|${r.source}`, r)
  const sorted = [...byKey.values()].filter(r => r.at >= now - keep(id)).sort((a, b) => a.at - b.at)
  // A run of identical Readings keeps only its newest: it says the same, later.
  return sorted.filter((r, i) => !(sorted[i + 1] && same(r, sorted[i + 1]!)))
}

const asReadings = (v: unknown): Reading[] =>
  Array.isArray(v) ? v.filter((r): r is Reading => r && typeof r.at === 'number' && typeof r.left === 'number' && typeof r.resetsAt === 'number') : []

/** Adds Readings to the log, merging with what every session stored. */
export async function addReadings($: EngineInterface, readings: readonly [WindowId, Reading][], now: number) {
  const ids = new Set(readings.map(([id]) => id))
  for (const id of ids) {
    const fresh = readings.filter(([i]) => i === id).map(([, r]) => r)
    const own = [...(mine.get(id) ?? []), ...fresh].filter(r => r.at >= now - H)
    mine.set(id, own)
    const stored = asReadings(await $.store.get(PREFIX + id))
    await $.store.set(PREFIX + id, merge(id, now, stored, own))
  }
}

/** Every window's stored Readings, oldest first. */
export async function loadLog($: EngineInterface): Promise<Log> {
  const log = new Map<WindowId, Reading[]>()
  for (const key of await $.store.keys()) {
    if (!key.startsWith(PREFIX)) continue
    const list = asReadings(await $.store.get(key))
    if (list.length) log.set(key.slice(PREFIX.length) as WindowId, list.sort((a, b) => a.at - b.at))
  }
  return log
}

/** A window's newest Reading, whatever its source. */
export const newest = (log: Log, id: WindowId): Reading | undefined => log.get(id)?.at(-1)

export const modelWindows = (log: Log): string[] =>
  [...log.keys()].filter(id => id.startsWith('model:')).map(id => id.slice('model:'.length)).sort()

// Active Use: the 5-minute slots in which Claude ran a turn in any session,
// pooled the same way (a union, re-merged with this session's own).
const ACTIVE = 'active'
const SLOT_MS = 5 * 60_000
const mySlots = new Set<number>()

const asSlots = (v: unknown): number[] => (Array.isArray(v) ? v.filter((s): s is number => Number.isInteger(s)) : [])

export async function addSlots($: EngineInterface, slots: readonly number[], now: number) {
  const from = Math.floor((now - 7 * DAY) / SLOT_MS)
  for (const s of slots) mySlots.add(s)
  for (const s of mySlots) if (s * SLOT_MS < now - H) mySlots.delete(s)
  const all = new Set([...asSlots(await $.store.get(ACTIVE)), ...slots, ...mySlots])
  await $.store.set(ACTIVE, [...all].filter(s => s >= from).sort((a, b) => a - b))
}

export async function loadSlots($: EngineInterface): Promise<number[]> {
  return asSlots(await $.store.get(ACTIVE))
}
