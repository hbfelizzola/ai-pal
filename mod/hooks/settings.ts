// ai-pal's settings, kept in $.store and changed only through `/ai-pal`.
import type { EngineInterface } from 'claude-code'

export type QuietHours = { start: number; end: number } // minutes into the local day
/** The Pane's dials: fuel-gauge rings, needle dials, or the one split ring. */
export const GAUGES = ['fuel', 'needle', 'ring'] as const
export type Gauges = (typeof GAUGES)[number]
export type Settings = {
  nudges: boolean
  fiveHourThreshold: number | 'off'
  weeklyThreshold: number | 'off'
  quietHours: QuietHours | 'off'
  band: boolean
  gauges: Gauges
}

export const DEFAULTS: Settings = {
  nudges: true,
  fiveHourThreshold: 40,
  weeklyThreshold: 30,
  quietHours: { start: 23 * 60, end: 8 * 60 },
  band: true,
  gauges: 'fuel',
}

/** The names `/ai-pal set` takes, each with its parse and its spelling. */
export const NAMES = ['nudges', '5h-threshold', 'weekly-threshold', 'quiet-hours', 'band', 'gauges'] as const
export type Name = (typeof NAMES)[number]
const FIELD = {
  nudges: 'nudges',
  '5h-threshold': 'fiveHourThreshold',
  'weekly-threshold': 'weeklyThreshold',
  'quiet-hours': 'quietHours',
  band: 'band',
  gauges: 'gauges',
} as const satisfies Record<Name, keyof Settings>

export const ACCEPTED: Record<Name, string> = {
  nudges: '`on` or `off`',
  '5h-threshold': 'a whole % from 5 to 100 (`40` or `40%`), or `off`',
  'weekly-threshold': 'a whole % from 5 to 100 (`30` or `30%`), or `off`',
  'quiet-hours': '`HH:MM-HH:MM` in 24-hour local time (it may cross midnight; start and end must differ), or `off`',
  band: '`on` or `off`',
  gauges: '`fuel`, `needle` or `ring`',
}

const pad = (n: number) => String(n).padStart(2, '0')
const clock = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`

export function spell(name: Name, s: Settings): string {
  const v = s[FIELD[name]]
  if (typeof v === 'boolean') return v ? 'on' : 'off'
  if (typeof v === 'string') return v
  if (typeof v === 'number') return `${v}%`
  return `${clock(v.start)}-${clock(v.end)}`
}

const onOff = (t: string) => (t === 'on' ? true : t === 'off' ? false : undefined)
const percent = (t: string) => {
  if (t === 'off') return 'off' as const
  const m = /^(\d{1,3})%?$/.exec(t)
  const n = m ? Number(m[1]) : NaN
  return n >= 5 && n <= 100 ? n : undefined
}
const gauges = (t: string) => GAUGES.find(g => g === t)
const quiet = (t: string): QuietHours | 'off' | undefined => {
  if (t === 'off') return 'off'
  const m = /^([01]?\d|2[0-3]):([0-5]\d)-([01]?\d|2[0-3]):([0-5]\d)$/.exec(t)
  if (!m) return undefined
  const start = Number(m[1]) * 60 + Number(m[2])
  const end = Number(m[3]) * 60 + Number(m[4])
  return start === end ? undefined : { start, end }
}

/** `value` for `name` as a change to the settings, or undefined when it isn't one of the accepted values. */
export function parse(name: Name, value: string): Partial<Settings> | undefined {
  const t = value.trim().toLowerCase()
  const v = name === 'nudges' || name === 'band' ? onOff(t) : name === 'quiet-hours' ? quiet(t) : name === 'gauges' ? gauges(t) : percent(t)
  return v === undefined ? undefined : { [FIELD[name]]: v }
}

export const resetOne = (s: Settings, name: Name): Settings => ({ ...s, [FIELD[name]]: DEFAULTS[FIELD[name]] })

const KEY = 'settings'

/** The stored settings over the defaults; anything stored that no longer parses falls back. */
export async function loadSettings($: EngineInterface): Promise<Settings> {
  const stored = (await $.store.get(KEY)) as Record<string, unknown> | undefined
  const s = { ...DEFAULTS }
  if (!stored || typeof stored !== 'object') return s
  for (const name of NAMES) {
    const raw = stored[name]
    if (typeof raw !== 'string') continue
    const change = parse(name, raw)
    if (change) Object.assign(s, change)
  }
  return s
}

/** Stored by their `/ai-pal` spelling, only where they differ from the default. */
export async function saveSettings($: EngineInterface, s: Settings) {
  const out: Record<string, string> = {}
  for (const name of NAMES) if (spell(name, s) !== spell(name, DEFAULTS)) out[name] = spell(name, s)
  await $.store.set(KEY, out)
}

/** Whether `ms` falls in the Quiet Hours, local time. */
export function isQuiet(ms: number, q: Settings['quietHours']): boolean {
  if (q === 'off') return false
  const d = new Date(ms)
  const m = d.getHours() * 60 + d.getMinutes()
  return q.start < q.end ? m >= q.start && m < q.end : m >= q.start || m < q.end
}

/** The start of the Quiet Hours that `ms` falls in. */
export function quietStart(ms: number, q: QuietHours): number {
  const d = new Date(ms)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(q.start / 60), q.start % 60).getTime()
  return start <= ms ? start : new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, Math.floor(q.start / 60), q.start % 60).getTime()
}
