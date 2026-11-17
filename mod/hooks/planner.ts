// The Nudge planner: which Nudges should be booked right now, given the
// newest Readings, the settings and the clock, and for each window with none,
// why. Pure; the booker makes it so.
import type { Log, Reading } from './log'
import type { Settings } from './settings'
import { standing } from './standing'
import { H, hhmm, untilShort } from './time'

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

const keyOf = (p: Part) => `${p.window}|${new Date(p.reading.resetsAt).toISOString()}|${p.lead}`

function single(input: PlanInput, part: Part, at: number): Planned {
  const { left, resetsAt } = part.reading
  const text = `${NAMES[part.window]}: ${Math.round(left)}% left as of ${hhmm(part.reading.at)}, resets in ${untilShort(resetsAt - at)}. Use it before it's gone.`
  return { key: keyOf(part), at, text, parts: [part] }
}

export function plan(input: PlanInput): Plan {
  const { log, now, settings } = input
  const reasons: Plan['reasons'] = {}
  if (!settings.nudges) return { nudges: [], reasons: { five_hour: 'Nudges are off', seven_day: 'Nudges are off' } }
  const nudges: Planned[] = []

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
    const leads: Lead[] = window === 'five_hour' ? ['1h'] : ['24h', '3h']
    let booked = 0
    for (const lead of leads) {
      const at = resetsAt - LEAD_MS[lead]
      if (at <= now) continue
      nudges.push(single(input, { window, lead, reading: s.reading }, at))
      booked++
    }
    if (!booked) reasons[window] = `${name}: resets in ${untilShort(resetsAt - now)}, inside the last lead time`
  }
  return { nudges: nudges.sort((a, b) => a.at - b.at), reasons }
}
