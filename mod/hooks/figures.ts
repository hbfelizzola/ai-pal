// Figures: Active Use, Burn Rate and the Pace Call with its why. Pure
// computations over Readings, Active Use slots and the time.
import type { Log, Reading } from './log'
import { DAY, H, MIN, hours, until } from './time'

export const SLOT = 5 * MIN
const SPAN = 7 * DAY
/** Burn Rate is shown only once the rolling 7 days hold this much Active Use. */
export const MIN_ACTIVE_H = 1

/** The 5-minute slots a turn of `durationMs` ending at `end` ran in. */
export function slotsOf(end: number, durationMs: number): number[] {
  const first = Math.floor((end - Math.max(0, durationMs)) / SLOT)
  const last = Math.floor(end / SLOT)
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

/** Hours of Active Use in the rolling 7 days. */
export const activeHours = (slots: readonly number[], now: number) =>
  (slots.filter(s => s * SLOT >= now - SPAN && s * SLOT <= now).length * SLOT) / H

/**
 * Percent of the cap spent over the rolling 7 days. Within one window (one
 * Reset), what was spent is the highest % used seen less where it started;
 * a Reset starts again from 0. Taking the highest rather than summing every
 * rise keeps the session's figure (about a point under the endpoint's) from
 * counting as spending each time the two sources alternate.
 */
export function spent(readings: readonly Reading[], now: number): number {
  const recent = readings.filter(r => r.at >= now - SPAN && r.at <= now)
  const byReset = new Map<number, Reading[]>()
  for (const r of recent) byReset.set(r.resetsAt, [...(byReset.get(r.resetsAt) ?? []), r])
  const windows = [...byReset.values()].sort((a, b) => a[0]!.at - b[0]!.at)
  return windows.reduce((sum, list, i) => {
    const used = list.map(r => 100 - r.left)
    // The oldest window may have started before the 7 days: count from its first Reading.
    const from = i === 0 ? used[0]! : 0
    return sum + Math.max(0, Math.max(...used) - from)
  }, 0)
}

export type PaceCall = 'more' | 'track' | 'ease'
export const PACE_CALL_WORDS = { more: 'Use more', track: 'On track', ease: 'Ease off' } as const
export const PACE_CALL_HINTS = { more: 'or a bigger model', track: 'keep this pace', ease: 'or a lighter model' } as const

export type Pace = {
  kind: 'five_hour' | 'seven_day'
  /** % of the cap per hour of Active Use. */
  burn: number
  left: number
  /** Active Use you can expect before the Reset, in hours. */
  horizonH: number
  /** Active Use the Unused Allowance lasts at the Burn Rate, in hours. */
  needH: number
  duty: number
  paceCall: PaceCall
  /** The why: `~26% would go unused even nonstop · resets in 2h 0m`. */
  why: string
  /** Unused Allowance that would become Lost Allowance (Use more only). */
  unused?: number
  /** The rate as shown: %/h (5-hour) or %/day of your usual Active Use (weekly). */
  rate: number
  unit: '%/h' | '%/day'
  /** Zone edges on the dial, in the rate's unit: duty 1 and duty ½. */
  r1: number
  r2: number
}

export type Activity = { activeH: number; burn: { five_hour: number; seven_day: number } }

export function activity(log: Log, slots: readonly number[], now: number): Activity | undefined {
  const activeH = activeHours(slots, now)
  if (activeH < MIN_ACTIVE_H) return undefined
  return {
    activeH,
    burn: {
      five_hour: spent(log.get('five_hour') ?? [], now) / activeH,
      seven_day: spent(log.get('seven_day') ?? [], now) / activeH,
    },
  }
}

/**
 * The Pace Call for `left` % with `toResetMs` to go. Duty = Active Use needed
 * ÷ Active Use you can expect: the 5-hour horizon is the time to Reset (as if
 * nonstop), the weekly one that time × your usual share of Active Use.
 */
export function pace(kind: Pace['kind'], left: number, toResetMs: number, a: Activity): Pace {
  const burn = a.burn[kind]
  const toResetH = Math.max(0, toResetMs / H)
  const horizonH = kind === 'five_hour' ? toResetH : (toResetH * a.activeH) / 168
  const needH = burn > 0 ? left / burn : Infinity
  const duty = needH / Math.max(horizonH, 0.01)
  const span = until(toResetMs)
  let paceCall: PaceCall
  let why: string
  let unused: number | undefined
  if (duty > 1) {
    paceCall = 'more'
    unused = Math.max(1, Math.round(left - burn * horizonH))
    why = `~${unused}% would go unused ${kind === 'five_hour' ? 'even nonstop' : 'at your usual Active Use'} · resets in ${span}`
  } else if (duty >= 0.5) {
    paceCall = 'track'
    why = `spends it in ~${hours(needH)} h of use · ${span} left`
  } else {
    paceCall = 'ease'
    why = `runs out after ~${hours(needH)} h of use · ${span} left`
  }
  // Either way rate ÷ r1 = 1 ÷ duty, so the dial's zones agree with the Pace Call.
  const perDay = a.activeH / 7
  const rate = kind === 'five_hour' ? burn : burn * perDay
  const r1 = kind === 'five_hour' ? left / Math.max(horizonH, 0.01) : left / Math.max(toResetH / 24, 0.01)
  return { kind, burn, left, horizonH, needH, duty, paceCall, why, unused, rate, unit: kind === 'five_hour' ? '%/h' : '%/day', r1, r2: 2 * r1 }
}
