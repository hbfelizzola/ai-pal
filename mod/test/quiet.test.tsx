// #26 Quiet Hours, the weekly skip and merged Nudges.
import { expect, test, type Engine } from 'claude-code/testing'
import { at, engine, limit, nudgeKey, type World } from './engine'

const start = async ($: Engine, w: World) => {
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  await w.clock.settle()
}
const measure = ($: Engine, ...rateLimits: ReturnType<typeof limit>[]) =>
  $.session.measure({ context: {} as never, changed: ['rateLimits'], rateLimits })
const booked = (w: World) => (w.store.get('nudges') as { key: string; at: number }[]).map(n => [n.key, n.at])

test('a 5-hour Nudge inside Quiet Hours is dropped, at either side of midnight', async ($, on) => {
  const w = engine(on, { now: at(0, 21) })
  await start($, w)
  await measure($, limit('five_hour', 20, at(1, 0, 30))) // due 23:30
  expect(w.notified).toEqual([])
  await measure($, limit('five_hour', 20, at(1, 8))) // a later window, due 07:00
  expect(w.notified).toEqual([])
})

test('a weekly Nudge inside Quiet Hours moves earlier, to just before they start', async ($, on) => {
  const w = engine(on)
  await start($, w)
  const reset = at(3, 5) // Fri 05:00: due Thu 05:00 and Fri 02:00
  await measure($, limit('seven_day', 50, reset))
  expect(w.notified.map(n => [n.at, n.text])).toEqual([
    [at(1, 22, 55), 'Weekly: 50% left as of 14:00, resets in 30h 5m. Use it before it\'s gone.'],
    [at(2, 22, 55), 'Weekly: 50% left as of 14:00, resets in 6h 5m. Use it before it\'s gone.'],
  ])
})

test('the 5-hour Nudge is skipped while the weekly window is under 10%', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await measure($, limit('five_hour', 38, at(0, 16, 12)), limit('seven_day', 92, at(3, 18)))
  expect(w.notified).toEqual([])
})

test('a 5-hour and a weekly Nudge due within 30 min are one notification carrying both', async ($, on) => {
  const w = engine(on)
  await start($, w)
  // 5-hour due 15:12; weekly's 3 h Nudge due 15:30.
  await measure($, limit('five_hour', 38, at(0, 16, 12)), limit('seven_day', 60, at(0, 18, 30)))
  expect(w.notified).toEqual([{
    text: '5-hour: 62% left as of 14:00, resets in 1h\nWeekly: 40% left as of 14:00, resets in 3h 18m\nUse it before it\'s gone.',
    title: 'ai-pal',
    key: `${nudgeKey('five_hour', at(0, 16, 12), '1h')}+${nudgeKey('seven_day', at(0, 18, 30), '3h')}`,
    at: at(0, 15, 12),
    untilBack: true,
  }])

  // The 5-hour figure falls under its threshold: the merge splits, the weekly Nudge stands alone.
  await measure($, limit('five_hour', 70, at(0, 16, 12)))
  expect(w.cancelled).toEqual([`${nudgeKey('five_hour', at(0, 16, 12), '1h')}+${nudgeKey('seven_day', at(0, 18, 30), '3h')}`])
  expect(booked(w)).toEqual([[nudgeKey('seven_day', at(0, 18, 30), '3h'), at(0, 15, 30)]])
})

test('a weekly Nudge moved out of Quiet Hours merges with a 5-hour Nudge just before them', async ($, on) => {
  const w = engine(on, { now: at(0, 21) })
  await start($, w)
  // 5-hour due 22:40; weekly's 3 h Nudge due 23:30, moved to 22:55.
  await measure($, limit('five_hour', 38, at(0, 23, 40)), limit('seven_day', 60, at(1, 2, 30)))
  expect(booked(w)).toEqual([[`${nudgeKey('five_hour', at(0, 23, 40), '1h')}+${nudgeKey('seven_day', at(1, 2, 30), '3h')}`, at(0, 22, 40)]])
})
