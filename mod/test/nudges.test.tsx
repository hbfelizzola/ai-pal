// #25 Book and rebook Unused Allowance Nudges.
import { expect, test, type Engine } from 'claude-code/testing'
import { MIN, at, engine, iso, limit, shown, type World } from './engine'

const start = async ($: Engine, w: World) => {
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  await w.clock.settle()
}
const measure = ($: Engine, ...rateLimits: ReturnType<typeof limit>[]) =>
  $.session.measure({ context: {} as never, changed: ['rateLimits'], rateLimits })

const FIVE_RESET = at(0, 16, 12) // today 16:12
const WEEK_RESET = at(3, 18) // Fri 18:00

test('62% left of the 5-hour window, you have left: a Nudge 1 h before the Reset', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await measure($, limit('five_hour', 38, FIVE_RESET))
  expect(w.notified).toEqual([{
    text: '5-hour: 62% left as of 14:00, resets in 1h. Use it before it\'s gone.',
    title: 'ai-pal',
    key: `five_hour|${iso(FIVE_RESET)}|1h`,
    at: at(0, 15, 12),
    untilBack: true,
  }])
})

test('under the 40% threshold, no 5-hour Nudge', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await measure($, limit('five_hour', 70, FIVE_RESET))
  expect(w.notified).toEqual([])
})

test('weekly: Nudges 24 h and 3 h before the Reset with 30% or more left', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await measure($, limit('seven_day', 60, WEEK_RESET))
  expect(w.notified.map(n => [n.key, n.at, n.text])).toEqual([
    [`seven_day|${iso(WEEK_RESET)}|24h`, at(2, 18), 'Weekly: 40% left as of 14:00, resets in 24h. Use it before it\'s gone.'],
    [`seven_day|${iso(WEEK_RESET)}|3h`, at(3, 15), 'Weekly: 40% left as of 14:00, resets in 3h. Use it before it\'s gone.'],
  ])
})

test('each new Reading rebooks under the same key with the new figure, and cancels what no longer qualifies', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await measure($, limit('five_hour', 38, FIVE_RESET))
  await w.clock.advance(10 * MIN)
  await measure($, limit('five_hour', 45, FIVE_RESET))
  expect(w.notified.map(n => n.text)).toEqual([
    '5-hour: 62% left as of 14:00, resets in 1h. Use it before it\'s gone.',
    '5-hour: 55% left as of 14:10, resets in 1h. Use it before it\'s gone.',
  ])
  expect(new Set(w.notified.map(n => n.key)).size).toBe(1)
  // The same figure again changes nothing.
  await measure($, limit('five_hour', 45, FIVE_RESET))
  expect(w.notified).toHaveLength(2)
  await w.clock.advance(10 * MIN)
  await measure($, limit('five_hour', 65, FIVE_RESET))
  expect(w.cancelled).toEqual([`five_hour|${iso(FIVE_RESET)}|1h`])
})

test('a stale Reading keeps its booked Nudges', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await measure($, limit('five_hour', 38, FIVE_RESET), limit('seven_day', 60, WEEK_RESET))
  await w.clock.advance(50 * MIN) // the 5-hour figure is now 50 min old
  await measure($, limit('seven_day', 61, WEEK_RESET))
  expect(w.cancelled).toEqual([])
})

test('after a Reset, the new window gets Nudges only once a Reading of it arrives', async ($, on) => {
  const w = engine(on, { now: at(0, 16, 30), store: { 'readings:five_hour': [{ at: at(0, 15), source: 'api', left: 80, resetsAt: FIVE_RESET }] } })
  await start($, w)
  await measure($, limit('seven_day', 60, WEEK_RESET))
  expect(w.notified.filter(n => n.key?.startsWith('five_hour'))).toEqual([])
  await measure($, limit('five_hour', 5, at(0, 21, 12)))
  expect(w.notified.filter(n => n.key?.startsWith('five_hour')).map(n => n.at)).toEqual([at(0, 20, 12)])
})

test('booked Nudges are kept in the store, and the Pane marks their window with an amber dot', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await measure($, limit('five_hour', 38, FIVE_RESET), limit('seven_day', 80, WEEK_RESET))
  expect(w.store.get('nudges')).toEqual([
    expect.objectContaining({ key: `five_hour|${iso(FIVE_RESET)}|1h`, at: at(0, 15, 12) }),
  ])
  const ui = await $.ui.mount({ ...w.pane, surface: 'desktop' })
  const text = shown(await ui.drawn())
  expect(text).toContain('<tspan fill="#E5A50A">● </tspan>5-hour · 2h 12m')
  expect(text).not.toContain('<tspan fill="#E5A50A">● </tspan>Weekly')
  const term = await $.ui.mount({ ...w.pane, surface: 'terminal' })
  expect(shown(await term.drawn())).toMatch(/● \n5-hour · 2h 12m/)
})

test('the terminal never books a Nudge: it would show at once instead of when due', async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await measure($, limit('five_hour', 38, FIVE_RESET))
  expect(w.notified).toEqual([])
})
