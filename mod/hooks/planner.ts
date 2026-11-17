// The Nudge planner: which Nudges should be booked right now, given the
// newest Readings, the settings and the clock, and for each window with none,
// why. Pure; the booker makes it so.
import { activity, pace, type Activity, type Pace } from './figures'
import { modelWindows, type Log, type Reading } from './log'
import { modelLine } from './models'
import { isQuiet, quietStart, type Settings } from './settings'
import { standing } from './standing'
import { WINDOWS, type MainWindow } from './windows'
import { H, MIN, hhmm, hours, untilShort, weekdayTime } from './time'

/** Two Nudges due this close together go out as one. */
const MERGE_WITHIN = 30 * MIN
/** The 5-hour Nudge is skipped while the weekly window has less than this left. */
const WEEKLY_FLOOR = 10
/** A weekly Nudge moved out of Quiet Hours goes this long before they start. */
const BEFORE_QUIET = 5 * MIN

export type Lead = '1h' | '24h' | '3h'
const LEAD_MS: Record<Lead, number> = { '1h': H, '24h': 24 * H, '3h': 3 * H }

/** One window's part of a Nudge. */
export type Part = { window: MainWindow; lead: Lead; reading: Reading }

export type Planned = {
  /** Window + Reset + lead time, so a rebook replaces rather than stacks. */
  key: string
  at: number
  text: string
  parts: Part[]
  /** The model lines in `text` (weekly Nudges only). */
  models: string[]
  /** Model windows left out because they don't Reset with the weekly window. */
  notWith: string[]
}

export type Plan = { nudges: Planned[]; reasons: Partial<Record<MainWindow, string>> }
export type PlanInput = { log: Log; now: number; settings: Settings; slots: readonly number[] }

/** `5h-202611171612-1h`: window, Reset (UTC, to the minute) and lead time; a host takes keys of up to 64 characters. */
const keyOf = (p: Part) =>
  `${p.window === 'five_hour' ? '5h' : 'wk'}-${new Date(p.reading.resetsAt).toISOString().replace(/\D/g, '').slice(0, 12)}-${p.lead}`

const CLOSER = "Use it before it's gone."
const BIGGER = 'Try a bigger model.'
const head = (p: Part, at: number) =>
  `${WINDOWS[p.window].name}: ${Math.round(p.reading.left)}% left as of ${hhmm(p.reading.at)}, resets in ${untilShort(p.reading.resetsAt - at)}`

/**
 * The Pace Call at the Nudge: the Reading's Unused Allowance, the horizon
 * from delivery to the Reset, the current Burn Rate. Computed at booking and
 * refreshed by each rebook; it never decides whether a Nudge fires.
 */
const paceAt = (a: Activity | undefined, p: Part, at: number): Pace | undefined =>
  a && pace(p.window, p.reading.left, p.reading.resetsAt - at, a)

/**
 * One line per model-specific window that Resets within 30 min of the weekly
 * window, whatever its figure, worded as its Pane row; it names its own
 * Reading's time when that differs from the weekly figure's.
 */
function models(log: Log, week: Reading, now: number): Pick<Planned, 'models' | 'notWith'> {
  const out: Pick<Planned, 'models' | 'notWith'> = { models: [], notWith: [] }
  for (const name of modelWindows(log)) {
    const line = modelLine(log, name, now)
    if (!line) continue
    if (Math.abs(line.resetsAt - week.resetsAt) > MERGE_WITHIN) out.notWith.push(`${name}: resets ${weekdayTime(line.resetsAt)}, not with weekly`)
    else out.models.push(hhmm(line.at) === hhmm(week.at) ? line.text : `${line.text} · as of ${hhmm(line.at)}`)
  }
  return out
}

function single(input: PlanInput, a: Activity | undefined, part: Part, at: number): Planned {
  const p = paceAt(a, part, at)
  let closer = CLOSER
  if (p?.paceCall === 'more') closer = `${part.window === 'five_hour' ? 'Even nonstop' : 'At your usual pace'}, ~${p.unused}% would go unused.`
  else if (p?.paceCall === 'track') closer = `~${hours(p.needH)} h of use spends it.`
  const m = part.window === 'seven_day' ? models(input.log, part.reading, input.now) : { models: [], notWith: [] }
  // Model lines go last, so a truncated notification loses them first; only the advice follows.
  const lines = [`${head(part, at)}. ${closer}`, ...m.models]
  if (p?.paceCall === 'more') {
    if (m.models.length) lines.push(BIGGER)
    else lines[0] += ` ${BIGGER}`
  }
  return { key: keyOf(part), at, text: lines.join('\n'), parts: [part], ...m }
}

/** A 5-hour and a weekly Nudge as one notification, at the earlier of the two. */
function merged(input: PlanInput, a: Activity | undefined, five: Candidate, week: Candidate): Planned {
  const at = Math.min(five.at, week.at)
  const paces = [five, week].map(c => paceAt(a, c.part, at))
  const lines = [five, week].map((c, i) => {
    const p = paces[i]
    const why = p?.paceCall === 'more'
      ? ` · ~${p.unused}% unused ${c.part.window === 'five_hour' ? 'even nonstop' : 'at your usual pace'}`
      : p?.paceCall === 'track' ? ` · ~${hours(p.needH)} h of use spends it` : ''
    return head(c.part, at) + why
  })
  const m = models(input.log, week.part.reading, input.now)
  lines.push(...m.models)
  if (paces.some(p => p?.paceCall === 'more')) lines.push(BIGGER)
  else if (!paces.some(p => p?.paceCall === 'track')) lines.push(CLOSER)
  return { key: `${keyOf(five.part)}+${keyOf(week.part)}`, at, text: lines.join('\n'), parts: [five.part, week.part], ...m }
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
    const name = WINDOWS[window].name
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
    let quietReason: string | undefined
    for (const lead of ['24h', '3h'] as const) {
      const due = resetsAt - LEAD_MS[lead]
      let at = due
      // Moved earlier, not dropped: a weekly loss is worth knowing before you sleep.
      if (settings.quietHours !== 'off' && isQuiet(due, settings.quietHours)) {
        const began = quietStart(due, settings.quietHours)
        at = began - BEFORE_QUIET
        if (at <= now && due > now) quietReason = `${name}: due ${hhmm(due)}, inside Quiet Hours that began at ${hhmm(began)}`
      }
      if (at > now) week.push({ part: { window, lead, reading: s.reading }, at })
    }
    // Both moved to the same evening: the later lead says it all.
    if (week.length === 2 && week[1]!.at - week[0]!.at <= MERGE_WITHIN) week.shift()
    if (!week.length) reasons[window] = quietReason ?? `${name}: resets in ${untilShort(resetsAt - now)}, inside the 3 h lead time`
  }

  const a = activity(log, input.slots, now)
  const [f] = five
  const partner = f && week.filter(c => Math.abs(c.at - f.at) <= MERGE_WITHIN).sort((a, b) => Math.abs(a.at - f.at) - Math.abs(b.at - f.at))[0]
  if (f && partner) nudges.push(merged(input, a, f, partner))
  else if (f) nudges.push(single(input, a, f.part, f.at))
  for (const c of week) if (c !== partner) nudges.push(single(input, a, c.part, c.at))
  return { nudges: nudges.sort((a, b) => a.at - b.at), reasons }
}
