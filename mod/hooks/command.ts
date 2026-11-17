// The settings command, `/ai-pal`: show the settings and what is booked,
// `set <setting> <value>`, `reset [setting]`. The wording lives here; the
// wiring (re-evaluating Nudges) in register.tsx.
import type { Booked, Change } from './booker'
import type { Plan } from './planner'
import { ACCEPTED, DEFAULTS, NAMES, parse, resetOne, spell, type Name, type Settings } from './settings'
import { weekdayTime } from './time'
import { WINDOWS } from './windows'

export const USAGE = 'Usage: /ai-pal, /ai-pal set <setting> <value>, /ai-pal reset [setting]'

export type Request =
  | { kind: 'show' }
  | { kind: 'change'; settings: Settings; said: string }
  | { kind: 'refuse'; text: string }

const isName = (t: string): t is Name => (NAMES as readonly string[]).includes(t)
const unknown = (t: string) => `\`${t}\` is not a setting. Settings: ${NAMES.join(', ')}. Nothing changed.`
const now = (name: Name, s: Settings) => `${name} is now ${spell(name, s)} (default ${spell(name, DEFAULTS)}).`

/** What `/ai-pal <args>` asks for, given the current settings. */
export function request(args: string, current: Settings): Request {
  const [verb = '', name = '', ...rest] = args.trim().split(/\s+/).filter(Boolean)
  if (!verb) return { kind: 'show' }
  if (verb === 'set') {
    if (!isName(name)) return { kind: 'refuse', text: name ? unknown(name) : `Settings: ${NAMES.join(', ')}. Nothing changed.` }
    const change = parse(name, rest.join(' '))
    if (!change) return { kind: 'refuse', text: `${name} takes ${ACCEPTED[name]}. Nothing changed.` }
    const settings = { ...current, ...change }
    return { kind: 'change', settings, said: now(name, settings) }
  }
  if (verb === 'reset') {
    if (!name) return { kind: 'change', settings: { ...DEFAULTS }, said: 'All settings are back to their defaults.' }
    if (!isName(name)) return { kind: 'refuse', text: unknown(name) }
    const settings = resetOne(current, name)
    return { kind: 'change', settings, said: now(name, settings) }
  }
  return { kind: 'refuse', text: USAGE }
}

const LEADS: Record<string, string> = { '1h': '1 h before', '24h': '24 h before', '3h': '3 h before' }

/** `5-hour, 1 h before · Tue 15:12`; a merged Nudge names both parts. */
export const describe = (b: Booked) =>
  `${b.windows.map((w, i) => `${WINDOWS[w].name}, ${LEADS[b.leads[i]!] ?? b.leads[i]}`).join(' + ')} · ${weekdayTime(b.at)}`

export function changed(change: Change): string {
  const lines = [...change.booked.map(b => `Booked: ${describe(b)}`), ...change.cancelled.map(b => `Cancelled: ${describe(b)}`)]
  return lines.length ? lines.join('\n') : 'No Nudge changed.'
}

/** The full `/ai-pal` listing. */
export function listing(settings: Settings, booked: readonly Booked[], plan: Plan, notes: readonly string[]): string {
  const out: string[] = [...notes]
  out.push('Settings:')
  for (const name of NAMES) out.push(`  ${name}: ${spell(name, settings)} (default ${spell(name, DEFAULTS)})`)
  out.push(booked.length ? 'Booked Nudges:' : 'Booked Nudges: none')
  for (const b of booked) {
    out.push(`  ${describe(b)}`)
    // Model lines and the model windows left out sit one step further in.
    const models = new Set(b.models ?? [])
    const lines = b.text.split('\n')
    const last = lines.reduce((at, line, i) => (models.has(line) ? i : at), -1)
    // The left-out windows follow the model lines, or the first line when there are none.
    const after = last >= 0 ? last : 0
    lines.forEach((line, i) => {
      out.push(`${models.has(line) ? '      ' : '    '}${line}`)
      if (i === after) for (const reason of b.notWith ?? []) out.push(`      ${reason}`)
    })
  }
  const reasons = Object.values(plan.reasons)
  if (reasons.length) {
    out.push('No Nudge:')
    for (const r of new Set(reasons)) out.push(`  ${r}`)
  }
  return out.join('\n')
}
