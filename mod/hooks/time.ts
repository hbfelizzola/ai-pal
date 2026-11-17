// Clock arithmetic and the ways ai-pal writes a time.

export const MIN = 60_000
export const H = 60 * MIN
export const DAY = 24 * H

const pad = (n: number) => String(n).padStart(2, '0')
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Resets jitter by about a second between calls: snap them to the minute. */
export const snap = (ms: number) => Math.round(ms / MIN) * MIN

/** Local `HH:MM`. */
export const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Local `Fri 01:00`. */
export const weekdayTime = (ms: number) => `${WEEKDAYS[new Date(ms).getDay()]} ${hhmm(ms)}`

/** A countdown: `52m`, `2h 0m`, `2d 4h`. */
export function until(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

/** How long ago: `2m ago`, `45m ago`, `3h ago`. */
export function ago(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/** An age as a figure's suffix: `45m old`, `3h old`. */
export const old = (ms: number) => (ms < MIN ? 'just now' : ago(ms).replace(' ago', ' old'))

/** Time to a Reset as the ring and band show it: a countdown under 24 h, a weekday and time beyond. */
export const resetLabel = (resetsAt: number, now: number) =>
  resetsAt - now < DAY ? until(resetsAt - now) : weekdayTime(resetsAt)

/** Time to a Reset as a Nudge says it: `52m`, `3h`, `1h 10m`, `24h`, `3d`. */
export function untilShort(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
  return `${Math.round(h / 24)}d`
}

/** Hours of use: one decimal under 10 h (`0.8`), whole beyond (`14`). */
export const hours = (h: number) => (h < 10 ? h.toFixed(1) : String(Math.round(h)))

/** A rate: one decimal under 10 (`6.3`), whole beyond (`18`). */
export const rate = (r: number) => (r < 10 ? r.toFixed(1) : String(Math.round(r)))
