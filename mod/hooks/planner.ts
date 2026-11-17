// The Nudge planner: which Nudges should be booked right now, given the
// newest Readings, the settings and the clock, and for each window with none,
// why. Pure; the booker makes it so.
import type { Log, Reading } from './log'
import { isQuiet, quietStart, type Settings } from './settings'
import { standing } from './standing'
import { H, MIN, hhmm, untilShort } from './time'

/** Two Nudges due this close together go out as one. */
const MERGE_WITHIN = 30 * MIN
/** The 5-hour Nudge is skipped while the weekly window has less than this left. */
const WEEKLY_FLOOR = 10
/** A weekly Nudge moved out of Quiet Hours goes this long before they start. */
const BEFORE_QUIET = 5 * MIN

export type MainWindow = 'five_hour' | 'seven_day'
export type Lead = '1h' | '24h' | '3h'
const LEAD_MS: Record<Lead, number> = { '1h': H, '24h': 24 * H, '3h': 3 * H }
const NAMES: Record<MainWindow, string> = { five_hour: '5-hour', seven_day: 'Weekly' }

/** One window's part of a Nudge. */
export type Part = { window: MainWindow; lead: Lead; reading: Reading }

export type Planned = {
  /** Window + Reset + lead time, so a rebook replaces rather than stacks. */
  key: string
  at: number
  text: string
  parts: Part[]
}

export type Plan = { nudges: Planned[]; reasons: Partial<Record<MainWindow, string>> }
export type PlanInput = { log: Log; now: number; settings: Settings }

/** `5h-202611171612-1h`: window, Reset (UTC, to the minute) and lead time; a host takes keys of up to 64 characters. */
const keyOf = (p: Part) =>
  `${p.window === 'five_hour' ? '5h' : 'wk'}-${new Date(p.reading.resetsAt).toISOString().replace(/\D/g, '').slice(0, 12)}-${p.lead}`

const CLOSER = "Use it before it's gone."
const head = (p: Part, at: number) =>
  `${NAMES[p.window]}: ${Math.round(p.reading.left)}% left as of ${hhmm(p.reading.at)}, resets in ${untilShort(p.reading.resetsAt - at)}`

function single(input: PlanInput, part: Part, at: number): Planned {
  return { key: keyOf(part), at, text: `${head(part, at)}. ${CLOSER}`, parts: [part] }
}

/** A 5-hour and a weekly Nudge as one notification, at the earlier of the two. */
function merged(input: PlanInput, five: Candidate, week: Candidate): Planned {
  const at = Math.min(five.at, week.at)
  const lines = [head(five.part, at), head(week.part, at), CLOSER]
  return { key: `${keyOf(five.part)}+${keyOf(week.part)}`, at, text: lines.join('\n'), parts: [five.part, week.part] }
}

type Candidate = { part: Part; at: number }
export function plan(input: PlanInput): Plan {
  const { log, now, settings } = input
  const reasons: Plan['reasons'] = {}
  if (!settings.nudges) return { nudges: [], reasons: { five_hour: 'Nudges are off', seven_day: 'Nudges are off' } }
  const nudges: Planned[] = []
  const five: Candidate[] = []
  const week: Candidate[] = []

  for (const window of ['five_hour', 'seven_day'] as const) {
    const name = NAMES[window]
    const s = standing(log, window, now)
    const threshold = window === 'five_hour' ? settings.fiveHourThreshold : settings.weeklyThreshold
    if (s.state === 'missing') {
      reasons[window] = `${name}: no Reading yet`
      continue
    }
    if (s.state === 'reset') {
      reasons[window] = `${name}: reset at ${hhmm(s.reading.resetsAt)}, waiting for a Reading of the new window`
      continue
    }
    const { left, resetsAt } = s.reading
    if (threshold === 'off') {
      reasons[window] = `${name}: threshold off`
      continue
    }
    if (left < threshold) {
      reasons[window] = `${name}: ${Math.round(left)}% left, under the ${threshold}% threshold`
      continue
    }
    if (window === 'five_hour') {
      const week = standing(log, 'seven_day', now)
      if (week.state === 'read' && week.reading.left < WEEKLY_FLOOR) {
        reasons[window] = `${name}: weekly has only ${Math.round(week.reading.left)}% left, under ${WEEKLY_FLOOR}%`
        continue
      }
      const at = resetsAt - LEAD_MS['1h']
      if (at <= now) reasons[window] = `${name}: resets in ${untilShort(resetsAt - now)}, inside the 1 h lead time`
      else if (isQuiet(at, settings.quietHours)) reasons[window] = `${name}: due ${hhmm(at)}, inside Quiet Hours`
      else five.push({ part: { window, lead: '1h', reading: s.reading }, at })
      continue
    }
    for (const lead of ['24h', '3h'] as const) {
      let at = resetsAt - LEAD_MS[lead]
      // Moved earlier, not dropped: a weekly loss is worth knowing before you sleep.
      if (settings.quietHours !== 'off' && isQuiet(at, settings.quietHours)) at = quietStart(at, settings.quietHours) - BEFORE_QUIET
      if (at > now) week.push({ part: { window, lead, reading: s.reading }, at })
    }
    // Both moved to the same evening: the later lead says it all.
    if (week.length === 2 && week[1]!.at - week[0]!.at <= MERGE_WITHIN) week.shift()
    if (!week.length) reasons[window] = `${name}: resets in ${untilShort(resetsAt - now)}, inside the 3 h lead time`
  }

  const [f] = five
  const partner = f && week.filter(c => Math.abs(c.at - f.at) <= MERGE_WITHIN).sort((a, b) => Math.abs(a.at - f.at) - Math.abs(b.at - f.at))[0]
  if (f && partner) nudges.push(merged(input, f, partner))
  else if (f) nudges.push(single(input, f.part, f.at))
  for (const c of week) if (c !== partner) nudges.push(single(input, c.part, c.at))
  return { nudges: nudges.sort((a, b) => a.at - b.at), reasons }
}
