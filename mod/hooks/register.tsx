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
import { changed, listing, request } from './command'
import { plan } from './planner'
import { loadSettings, saveSettings } from './settings'
import { drawPane, type Scene } from './readout'
import { DAY, MIN } from './time'

const PANE = 'ai-pal'
/** Bumped whenever what the readout draws from may have changed. */
const rev = atom({ plugin: 'ai-pal', key: 'rev' } as const, 0)
const endpoint = atom({ plugin: 'ai-pal', key: 'endpoint' } as const, { state: 'unknown' } as EndpointState)
/** Ticks each second while the dials are drawn, for their countdown clocks; only the Pane reads it. */
const second = atom({ plugin: 'ai-pal', key: 'second' } as const, 0)

/** This session's poller; a reload starts a fresh one from session.start. */
const poller = newPoller()
/**
 * Whether this session can hold a Nudge until it's due. A terminal ignores
 * `at` and shows a notification at once, so only a host books them.
 */
let canBook = true
const TERMINAL_NOTE = 'This terminal session books no Nudges (a terminal would show them at once); sessions in the Claude desktop app do.'
const TERMINAL_CHANGE = 'This terminal session books and cancels no Nudges; sessions in the Claude desktop app apply the change at their next Reading.'

async function record($: EngineInterface, readings: [WindowId, Reading][]) {
  if (!readings.length) return
  await addReadings($, readings, await $.clock.now())
  await reevaluate($)
}

/** Re-plans the Nudges from the newest Readings and settings, and books the difference. */
async function reevaluate($: EngineInterface) {
  const now = await $.clock.now()
  const change = canBook
    ? await reconcile($, plan({ log: await loadLog($), now, settings: await loadSettings($), slots: await loadSlots($) }).nudges, now)
    : { booked: [], cancelled: [] }
  await update($, rev, n => n + 1)
  return change
}

/**
 * Claude Code deletes a mod's data after `cleanupPeriodDays` without use. A
 * store last used longer ago than that is cleared here the same way, and
 * `/ai-pal` says once that the settings are back to the defaults.
 */
async function housekeep($: EngineInterface) {
  const now = await $.clock.now()
  let days = 30
  try {
    const v = await $.settings.read({ key: 'cleanupPeriodDays' })
    if (typeof v === 'number' && v > 0) days = v
  } catch {
    // The default stands.
  }
  const seen = await $.store.get('seen')
  if (typeof seen === 'number' && now - seen > days * DAY) {
    for (const key of await $.store.keys()) await $.store.delete(key)
    await $.store.set('notice', `ai-pal went unused for over ${days} days, so its data was cleared and its settings are back to the defaults.`)
  }
  await $.store.set('seen', now)
}

/** `/ai-pal`'s answer. */
async function answer($: EngineInterface, args: string): Promise<string> {
  const req = request(args, await loadSettings($))
  if (req.kind === 'refuse') return req.text
  if (req.kind === 'change') {
    await saveSettings($, req.settings)
    const change = await reevaluate($)
    return `${req.said}\n${canBook ? changed(change) : TERMINAL_CHANGE}`
  }
  await reevaluate($)
  const notes: string[] = []
  const notice = await $.store.get('notice')
  if (typeof notice === 'string') {
    notes.push(notice)
    await $.store.delete('notice')
  }
  if (!canBook) notes.push(TERMINAL_NOTE)
  const now = await $.clock.now()
  const settings = await loadSettings($)
  const p = plan({ log: await loadLog($), now, settings, slots: await loadSlots($) })
  return listing(settings, await loadBooked($, now), p, notes)
}

/** Whether the next second's redraw is already booked. */
let isTickBooked = false

/**
 * Books a redraw of the dials at the next whole second. Each drawing books
 * the next, so the clocks tick while the Pane is drawn and stop when it isn't.
 */
function tickSoon($: EngineInterface, now: number) {
  if (isTickBooked) return
  isTickBooked = true
  $.clock.after(1000 - (now % 1000), () => {
    isTickBooked = false
    void update($, second, n => n + 1)
  })
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
    await housekeep($)
    await $.command.register({
      name: 'ai-pal',
      description: 'Show ai-pal\'s settings and booked Nudges, or change a setting',
      argumentHint: '[set <setting> <value> | reset [setting]]',
    })
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

  on('command.run', { command: 'ai-pal' }, async ($, e) => ({ text: await answer($, e.args) }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { gauges } = await loadSettings($)
    // The dials' clocks count seconds; the split ring and the terminal show minutes.
    if (gauges !== 'ring' && e.surface !== 'terminal') {
      await read($, second)
      tickSoon($, await $.clock.now())
    }
    return drawPane($, e, await scene($), gauges)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await loadSettings($)).band) return next(e)
    return drawBand($, e, await scene($)) ?? next(e)
  })
}
