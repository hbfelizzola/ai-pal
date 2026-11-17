// The Nudge booker: reconciles the plan with what is booked. Booked Nudges
// are recorded in $.store, so every session (and `/ai-pal`) sees the same
// list, and each is keyed so a rebook replaces rather than stacks.
import type { EngineInterface } from 'claude-code'
import type { Planned } from './planner'
import type { MainWindow } from './windows'

export type Booked = {
  key: string
  at: number
  text: string
  windows: MainWindow[]
  leads: string[]
  /** The model lines in `text`, and the model windows left out of it. */
  models: string[]
  notWith: string[]
}
export type Change = { booked: Booked[]; cancelled: Booked[] }

const KEY = 'nudges'
export const TITLE = 'ai-pal'

const asBooked = (p: Planned): Booked => ({
  key: p.key, at: p.at, text: p.text, windows: p.parts.map(x => x.window), leads: p.parts.map(x => x.lead),
  models: p.models, notWith: p.notWith,
})

/** What is booked and still to come. */
export async function loadBooked($: EngineInterface, now: number): Promise<Booked[]> {
  const v = await $.store.get(KEY)
  return Array.isArray(v) ? (v as Booked[]).filter(b => b && typeof b.key === 'string' && b.at > now) : []
}

/** Books what the plan adds or changes and cancels what it no longer holds. */
export async function reconcile($: EngineInterface, planned: readonly Planned[], now: number): Promise<Change> {
  const before = await loadBooked($, now)
  const change: Change = { booked: [], cancelled: [] }
  for (const p of planned) {
    const was = before.find(b => b.key === p.key)
    if (was && was.at === p.at && was.text === p.text) continue
    await $.ui.notify(p.text, { title: TITLE, key: p.key, at: p.at, untilBack: true })
    change.booked.push(asBooked(p))
  }
  for (const b of before) {
    if (planned.some(p => p.key === b.key)) continue
    await $.ui.cancelNotify(b.key)
    change.cancelled.push(b)
  }
  await $.store.set(KEY, planned.map(asBooked))
  return change
}
