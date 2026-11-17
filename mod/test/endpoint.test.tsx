// #20 Poll the usage endpoint.
import { expect, test, type Engine } from 'claude-code/testing'
import { DAY, H, MIN, NOW, at, engine, iso, limit, limitsReply, shown, type World } from './engine'

const start = async ($: Engine, w: World) => {
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  await w.clock.settle()
}
const paneText = async ($: Engine, w: World) => {
  const ui = await $.ui.mount({ ...w.pane, surface: 'terminal' })
  const text = shown(await ui.drawn())
  await ui.unmount()
  return text
}

test('every 5 minutes it asks the usage endpoint, signed in as the session', async ($, on) => {
  const w = engine(on)
  w.signIn()
  w.reply(limitsReply({ five: [38, NOW + 2 * H], week: [53, NOW + 3 * DAY] }))
  await start($, w)
  expect(w.fetches).toHaveLength(1)
  expect(w.fetches[0]).toEqual({
    url: 'https://api.anthropic.com/api/oauth/usage',
    headers: { 'anthropic-beta': 'oauth-2025-04-20' },
    auth: 'handle-1',
  })
  await w.clock.advance(5 * MIN)
  expect(w.fetches).toHaveLength(2)
  await w.clock.advance(10 * MIN)
  expect(w.fetches).toHaveLength(4)
})

test('limits[] rows become 5-hour, weekly and model-specific Readings', async ($, on) => {
  const w = engine(on)
  w.signIn()
  w.reply(limitsReply({
    five: [38, NOW + 2 * H], week: [53, at(3, 1)],
    models: [{ name: 'Fable', used: 10, reset: at(3, 1), share: 50 }],
  }))
  await start($, w)
  expect(w.store.get('readings:five_hour')).toEqual([{ at: NOW, source: 'api', left: 62, resetsAt: NOW + 2 * H }])
  expect(w.store.get('readings:seven_day')).toEqual([{ at: NOW, source: 'api', left: 47, resetsAt: at(3, 1) }])
  expect(w.store.get('readings:model:Fable')).toEqual([{ at: NOW, source: 'api', left: 90, resetsAt: at(3, 1), share: 50 }])
  const text = await paneText($, w)
  expect(text).toContain('62%')
  expect(text).toContain('47%')
})

test('without limits[], the legacy five_hour and seven_day keys are read', async ($, on) => {
  const w = engine(on)
  w.signIn()
  w.reply({ status: 200, body: {
    five_hour: { utilization: 30, resets_at: iso(NOW + 2 * H + 20_000) },
    seven_day: { utilization: 60, resets_at: iso(at(3, 1)) },
  } })
  await start($, w)
  expect(w.store.get('readings:five_hour')).toEqual([{ at: NOW, source: 'api', left: 70, resetsAt: NOW + 2 * H }])
  expect(w.store.get('readings:seven_day')).toEqual([{ at: NOW, source: 'api', left: 40, resetsAt: at(3, 1) }])
})

test('a busy endpoint is waited out: Retry-After when given, else a doubling wait up to 60 min', async ($, on) => {
  const w = engine(on)
  w.signIn()
  const busy = { status: 429, text: '' }
  w.reply({ status: 429, text: '', headers: { 'retry-after': '120' } }, busy, { status: 503, text: '' }, busy, busy, busy,
    limitsReply({ five: [38, NOW + 9 * H] }))
  await start($, w)
  // 0: 429 + Retry-After 120 s → 2; 429 → 10 min; 503 → 20; 429 → 40; 429 → 60; 429 → 60 (capped); 200 → back to 5 min.
  await w.clock.advance(4 * H)
  expect(w.fetchTimes.map(t => (t - NOW) / MIN)).toEqual([0, 2, 12, 32, 72, 132, 192, 197, 202, 207, 212, 217, 222, 227, 232, 237])
})

test('a refused credential turns the endpoint off for the session; session data carries on', async ($, on) => {
  const w = engine(on)
  w.signIn()
  w.reply({ status: 401, text: '' })
  await start($, w)
  await w.clock.advance(H)
  expect(w.fetches).toHaveLength(1)
  await $.session.measure({ context: {} as never, changed: ['rateLimits'], rateLimits: [limit('five_hour', 20, NOW + 3 * H)] })
  expect(await paneText($, w)).toContain('80%')
})

test('no credential at all means the endpoint is never asked', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await w.clock.advance(H)
  expect(w.fetches).toHaveLength(0)
})

test('a reply in neither shape turns the endpoint off', async ($, on) => {
  const w = engine(on)
  w.signIn()
  w.reply({ status: 200, body: { something: 'else' } })
  await start($, w)
  await w.clock.advance(H)
  expect(w.fetches).toHaveLength(1)
})

test('endpoint and session Readings share the log; the newest wins', async ($, on) => {
  const w = engine(on)
  w.signIn()
  w.reply(limitsReply({ five: [38, NOW + 2 * H] }))
  await start($, w)
  await w.clock.advance(MIN)
  await $.session.measure({ context: {} as never, changed: ['rateLimits'], rateLimits: [limit('five_hour', 41, NOW + 2 * H)] })
  expect(await paneText($, w)).toContain('59%')
  await w.clock.advance(4 * MIN) // the next poll
  expect(await paneText($, w)).toContain('62%')
})

test('model-specific Readings are kept 4 weeks', async ($, on) => {
  const old = (days: number) => ({ at: NOW - days * DAY, source: 'api', left: 50, resetsAt: NOW - days * DAY + H, share: 50 })
  const w = engine(on, { store: { 'readings:model:Fable': [old(29), old(27)] } })
  w.signIn()
  w.reply(limitsReply({ models: [{ name: 'Fable', used: 10, reset: at(3, 1), share: 50 }], week: [53, at(3, 1)] }))
  await start($, w)
  expect((w.store.get('readings:model:Fable') as { at: number }[]).map(r => r.at)).toEqual([NOW - 27 * DAY, NOW])
})
