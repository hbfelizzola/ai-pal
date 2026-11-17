// #29 Model-specific lines in the weekly Nudge.
import { expect, test, type Engine } from 'claude-code/testing'
import { H, MIN, NOW, at, engine, limit, limitsReply, type World } from './engine'

const start = async ($: Engine, w: World) => {
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  await w.clock.settle()
}
const measure = ($: Engine, ...rateLimits: ReturnType<typeof limit>[]) =>
  $.session.measure({ context: {} as never, changed: ['rateLimits'], rateLimits })
const aiPal = async ($: Engine, args = '') =>
  (await $.command.run({
    command: 'ai-pal', args, origin: { kind: 'composer' } as never, presentation: { isFullscreen: false, columns: 100 },
  })).text ?? ''
const slots = (end: number, count: number) => Array.from({ length: count }, (_, i) => Math.floor(end / (5 * MIN)) - i)
const r = (at: number, left: number, resetsAt: number, share?: number) => ({ at, source: 'api', left, resetsAt, ...(share ? { share } : {}) })

const WEEK_RESET = at(3, 18) // Fri 18:00
const reply = limitsReply({
  week: [60, WEEK_RESET],
  models: [
    { name: 'Fable', used: 10, reset: WEEK_RESET + 10 * MIN, share: 50 },
    { name: 'Opus', used: 20, reset: at(4, 3), share: 40 }, // Sat 03:00: not with weekly
  ],
})

test('a weekly Nudge carries a line per model window that Resets with it, last', async ($, on) => {
  const w = engine(on)
  w.signIn()
  w.reply(reply)
  await start($, w)
  expect(w.notified.map(n => n.text)).toEqual([
    'Weekly: 40% left as of 14:00, resets in 24h. Use it before it\'s gone.\nFable: 90% of its share left · weekly allows 80%',
    'Weekly: 40% left as of 14:00, resets in 3h. Use it before it\'s gone.\nFable: 90% of its share left · weekly allows 80%',
  ])
})

test('a model line names its Reading\'s age when it differs from the weekly figure\'s, and is left out without a Reading', async ($, on) => {
  const w = engine(on, { store: { 'readings:model:Fable': [r(NOW - 10 * MIN, 90, WEEK_RESET, 50)] } })
  await start($, w)
  await measure($, limit('seven_day', 60, WEEK_RESET))
  expect(w.notified[0]?.text).toBe('Weekly: 40% left as of 14:00, resets in 24h. Use it before it\'s gone.\nFable: 90% of its share left · weekly allows 80% · as of 13:50')
})

test('in a merged Nudge the model lines come after both windows, before only Try a bigger model.', async ($, on) => {
  const weekReset = at(0, 18, 30)
  const fiveReset = at(0, 16, 12)
  const w = engine(on, {
    store: {
      active: slots(NOW, 12),
      'readings:five_hour': [r(NOW - 2 * H, 80, fiveReset)],
      'readings:seven_day': [r(NOW - 2 * H, 42, weekReset)],
      'readings:model:Fable': [r(NOW, 90, weekReset, 50)],
    },
  })
  await start($, w)
  await measure($, limit('five_hour', 38, fiveReset), limit('seven_day', 60, weekReset))
  expect(w.notified.map(n => n.text)).toEqual([[
    '5-hour: 62% left as of 14:00, resets in 1h · ~44% unused even nonstop',
    'Weekly: 40% left as of 14:00, resets in 3h 18m · ~40% unused at your usual pace',
    'Fable: 90% of its share left · weekly allows 80%',
    'Try a bigger model.',
  ].join('\n')])
})

test('/ai-pal shows a sub-line per model under each booked weekly Nudge, or why it is left out', async ($, on) => {
  const w = engine(on)
  w.signIn()
  w.reply(reply)
  await start($, w)
  const text = await aiPal($)
  expect(text).toContain([
    '  Weekly, 24 h before · Thu 18:00',
    '    Weekly: 40% left as of 14:00, resets in 24h. Use it before it\'s gone.',
    '      Fable: 90% of its share left · weekly allows 80%',
    '      Opus: resets Sat 03:00, not with weekly',
  ].join('\n'))
})
