// #27 The Pace Call's why in Nudges.
import { expect, test, type Engine } from 'claude-code/testing'
import { DAY, H, MIN, NOW, at, engine, limit, type World } from './engine'

const start = async ($: Engine, w: World) => {
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  await w.clock.settle()
}
const measure = ($: Engine, ...rateLimits: ReturnType<typeof limit>[]) =>
  $.session.measure({ context: {} as never, changed: ['rateLimits'], rateLimits })
const slots = (end: number, count: number) => Array.from({ length: count }, (_, i) => Math.floor(end / (5 * MIN)) - i)
const r = (at: number, left: number, resetsAt: number) => ({ at, source: 'api', left, resetsAt })
const FIVE_RESET = at(0, 16, 12)

test('5-hour Use more: how much would go unused even if you came back now', async ($, on) => {
  // 1 h of Active Use spent 18%: 18%/h. 62% left; 1 h of nonstop use at the Nudge spends 18.
  const w = engine(on, { store: { active: slots(NOW, 12), 'readings:five_hour': [r(NOW - 2 * H, 80, FIVE_RESET)] } })
  await start($, w)
  await measure($, limit('five_hour', 38, FIVE_RESET))
  expect(w.notified.map(n => n.text)).toEqual([
    '5-hour: 62% left as of 14:00, resets in 1h. Even nonstop, ~44% would go unused. Try a bigger model.',
  ])
})

test('weekly Use more: at your usual pace, from the horizon at each Nudge\'s lead time', async ($, on) => {
  // 14 h of Active Use in 7 days (1/12 of the time); 42% spent: 3%/h. 35% left.
  // 24 h before: 2 h of expected use spends 6 → ~29% unused. 3 h before: 0.25 h → ~34%.
  const reset = at(3, 18)
  const w = engine(on, { store: { active: slots(NOW, 168), 'readings:seven_day': [r(NOW - 6 * DAY, 77, reset)] } })
  await start($, w)
  await measure($, limit('seven_day', 65, reset))
  expect(w.notified.map(n => n.text)).toEqual([
    'Weekly: 35% left as of 14:00, resets in 24h. At your usual pace, ~29% would go unused. Try a bigger model.',
    'Weekly: 35% left as of 14:00, resets in 3h. At your usual pace, ~34% would go unused. Try a bigger model.',
  ])
})

test('On track: how many hours of Active Use spend it', async ($, on) => {
  // 50%/h; 40% left takes 0.8 h of the 1 h before the Reset.
  const w = engine(on, { store: { active: slots(NOW, 12), 'readings:five_hour': [r(NOW - 2 * H, 90, FIVE_RESET)] } })
  await start($, w)
  await measure($, limit('five_hour', 60, FIVE_RESET))
  expect(w.notified.map(n => n.text)).toEqual(['5-hour: 40% left as of 14:00, resets in 1h. ~0.8 h of use spends it.'])
})

test('Ease off keeps the plain closer, and never stops the Nudge', async ($, on) => {
  // 100%/h: 40% left runs out in 0.4 h of the 1 h.
  const w = engine(on, {
    store: {
      active: slots(NOW, 12),
      'readings:five_hour': [r(NOW - 4 * H, 100, NOW - H), r(NOW - 90 * MIN, 60, NOW - H)],
    },
  })
  await start($, w)
  await measure($, limit('five_hour', 60, FIVE_RESET))
  expect(w.notified.map(n => n.text)).toEqual(['5-hour: 40% left as of 14:00, resets in 1h. Use it before it\'s gone.'])
})

test('a merged Nudge gives a compact why per window and one Try a bigger model. at the end', async ($, on) => {
  const weekReset = at(0, 18, 30)
  const w = engine(on, {
    store: {
      active: slots(NOW, 12),
      'readings:five_hour': [r(NOW - 2 * H, 80, FIVE_RESET)],
      'readings:seven_day': [r(NOW - 2 * H, 42, weekReset)],
    },
  })
  await start($, w)
  await measure($, limit('five_hour', 38, FIVE_RESET), limit('seven_day', 60, weekReset))
  expect(w.notified.map(n => n.text)).toEqual([[
    '5-hour: 62% left as of 14:00, resets in 1h · ~44% unused even nonstop',
    'Weekly: 40% left as of 14:00, resets in 3h 18m · ~40% unused at your usual pace',
    'Try a bigger model.',
  ].join('\n')])
})
