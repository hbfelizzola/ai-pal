// Where each Usage Window stands now, from its newest Reading: the one rule
// the Pane, the band and the Nudges all read for staleness and passed Resets.
import type { Log, Reading, WindowId } from './log'
import { newest } from './log'
import { MIN } from './time'

/** A Reading older than this is stale: shown, but not trusted as current. */
export const STALE_AFTER = 15 * MIN

export type Standing =
  | { state: 'missing' }
  | { state: 'reset'; reading: Reading }
  | { state: 'read'; reading: Reading; isStale: boolean }

export function standing(log: Log, id: WindowId, now: number): Standing {
  const reading = newest(log, id)
  if (!reading) return { state: 'missing' }
  if (reading.resetsAt <= now) return { state: 'reset', reading }
  return { state: 'read', reading, isStale: now - reading.at > STALE_AFTER }
}
