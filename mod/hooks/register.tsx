// ai-pal: a Claude Code mod that shows your plan's Unused Allowance per Usage
// Window and Nudges you, after you've left, before a Reset loses it.
//
// Each open session runs its own copy; $.store is the only thing they share.
// This file is the wiring: engine events in, the modules beside it decide.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { EndpointState } from '../types'
import { slotsOf } from './figures'
import { addReadings, addSlots, loadLog, loadSlots, type Reading, type WindowId } from './log'
import { ENDPOINT, ENDPOINT_HEADERS, newPoller, onFailure, onReply, passiveReadings, type PollOutcome } from './reader'
import { drawBand } from './band'
import { loadBooked, reconcile } from './booker'
import { plan } from './planner'
import { loadSettings } from './settings'
import { drawPane, type Scene } from './readout'
import { MIN } from './time'

const PANE = 'ai-pal'
/** Bumped whenever what the readout draws from may have changed. */
const rev = atom({ plugin: 'ai-pal', key: 'rev' } as const, 0)
const endpoint = atom({ plugin: 'ai-pal', key: 'endpoint' } as const, { state: 'unknown' } as EndpointState)

/** This session's poller; a reload starts a fresh one from session.start. */
const poller = newPoller()
/**
 * Whether this session can hold a Nudge until it's due. A terminal ignores
 * `at` and shows a notification at once, so only a host books them.
 */
let canBook = true

async function record($: EngineInterface, readings: [WindowId, Reading][]) {
  if (!readings.length) return
  await addReadings($, readings, await $.clock.now())
  await reevaluate($)
}

/** Re-plans the Nudges from the newest Readings and settings, and books the difference. */
async function reevaluate($: EngineInterface) {
  const now = await $.clock.now()
  const change = canBook
    ? await reconcile($, plan({ log: await loadLog($), now, settings: await loadSettings($) }).nudges, now)
    : { booked: [], cancelled: [] }
  await update($, rev, n => n + 1)
  return change
}

/** What a drawing reads; reading `rev` redraws it on every change. */
async function scene($: EngineInterface): Promise<Scene> {
  await read($, rev)
  const now = await $.clock.now()
  return { log: await loadLog($), now, endpoint: await read($, endpoint), slots: await loadSlots($), booked: await loadBooked($, now) }
}

/** Asks the usage endpoint once and books the next ask. */
async function poll($: EngineInterface) {
  const auth = await $.session.authorize()
  if (!auth) {
    await update($, endpoint, (): EndpointState => ({ state: 'off', why: 'refused' }))
    return
  }
  let outcome: PollOutcome
  try {
    const reply = await $.http.fetch(ENDPOINT, { headers: ENDPOINT_HEADERS, auth: auth.handle })
    outcome = onReply(poller, reply, await $.clock.now())
  } catch {
    outcome = onFailure(poller, await $.clock.now())
  }
  await update($, endpoint, () => outcome.state)
  await record($, outcome.readings)
  if (outcome.nextIn !== undefined) $.clock.after(outcome.nextIn, () => void poll($))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    canBook = e.surface !== 'terminal'
    void $.ui.open({ id: PANE, title: 'ai-pal' })
    // Redraw every minute: countdowns move, and other sessions write Readings.
    $.clock.every(MIN, () => void update($, rev, n => n + 1))
    const { rateLimits } = await $.session.usage()
    await record($, passiveReadings(rateLimits, await $.clock.now()))
    void poll($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await record($, passiveReadings(e.rateLimits, await $.clock.now()))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    await addSlots($, slotsOf(now, e.durationMs), now)
    await update($, rev, n => n + 1)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => drawPane($, e, await scene($)))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    return drawBand($, e, await scene($)) ?? next(e)
  })
}
