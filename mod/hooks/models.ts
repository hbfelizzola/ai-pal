// Model-specific weekly Usage Windows: one line each, the same wording in
// the Pane's rows and in a weekly Nudge.
import type { Log } from './log'
import { modelWindows } from './log'
import { standing } from './standing'

export type ModelLine = { name: string; text: string; isStale: boolean; at: number; resetsAt: number }

/**
 * `Fable: 90% of its share left · weekly allows 60%`: the window's own Unused
 * Allowance and, when the weekly window is the tighter cap, how much of the
 * model's share the weekly window still allows (weekly % left ÷ share, ≤ 100).
 */
export function modelLine(log: Log, name: string, now: number): ModelLine | undefined {
  const s = standing(log, `model:${name}`, now)
  if (s.state !== 'read') return undefined
  const { left, share, at, resetsAt } = s.reading
  const tilde = s.isStale ? '~' : ''
  let text = `${name}: ${tilde}${Math.round(left)}% of its share left`
  const week = standing(log, 'seven_day', now)
  if (week.state === 'read' && share) {
    const allows = Math.min(100, Math.round((week.reading.left / share) * 100))
    if (allows < left) text += ` · weekly allows ${allows}%`
  }
  return { name, text, isStale: s.isStale, at, resetsAt }
}

export const modelLines = (log: Log, now: number): ModelLine[] =>
  modelWindows(log).flatMap(name => modelLine(log, name, now) ?? [])
