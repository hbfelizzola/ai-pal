// #19 The split ring from session Readings.
import { expect, test, type Engine } from 'claude-code/testing'
import { DAY, H, MIN, NOW, SURFACES, at, engine, limit, shown } from './engine'

const start = ($: Engine, surface: 'desktop' | 'terminal' | null = null) =>
  $.session.start({ cwd: '/', surface, isInteractive: true })

test('a docked ai-pal Pane opens when a session starts', async ($, on) => {
  const w = engine(on)
  await start($)
  expect(w.opened).toEqual(['ai-pal'])
})

test('after a response, the ring shows each window\'s % left and time to Reset', async ($, on) => {
  const w = engine(on)
  await start($)
  // 38% of the 5-hour cap used, resets in 3h 9m; 53% of the weekly, resets Fri 01:00.
  await $.session.measure({
    context: {} as never, changed: ['rateLimits'],
    rateLimits: [limit('five_hour', 38, NOW + 3 * H + 9 * MIN), limit('seven_day', 53, at(3, 1))],
  })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...w.pane, surface })
    const text = shown(await ui.drawn())
    expect(text).toContain('62%')
    expect(text).toContain('5-hour · 3h 9m')
    expect(text).toContain('47%')
    expect(text).toContain('Weekly · Fri 01:00')
    await ui.unmount()
  }
})

test('the desktop ring is a 180px split ring in the window colours with a tooltip per arc', async ($, on) => {
  const w = engine(on)
  await start($)
  await $.session.measure({
    context: {} as never, changed: ['rateLimits'],
    rateLimits: [limit('five_hour', 38, NOW + 2 * H), limit('seven_day', 53, NOW + 2 * DAY + 4 * H)],
  })
  const ui = await $.ui.mount({ ...w.pane, surface: 'desktop' })
  const text = shown(await ui.drawn())
  expect(text).toContain('width="180" height="180"')
  expect(text).toContain('stroke-width="16.2"')
  for (const c of ['#F6A15B', '#E0703F', '#9A9AF7', '#5E5ED8', 'rgba(142,142,142,0.28)']) expect(text).toContain(c)
  expect(text).toContain('<title>Weekly · 47% left · resets in 2d 4h</title>')
  expect(text).toContain('<title>5-hour · 62% left · resets in 2h 0m</title>')
})

test('the newest Reading wins per Usage Window', async ($, on) => {
  const w = engine(on)
  w.setUsage([limit('five_hour', 10, NOW + 4 * H), limit('seven_day', 20, NOW + 3 * DAY)])
  await start($)
  await w.clock.advance(5 * MIN)
  await $.session.measure({
    context: {} as never, changed: ['rateLimits'],
    rateLimits: [limit('five_hour', 30, NOW + 4 * H)],
  })
  const ui = await $.ui.mount({ ...w.pane, surface: 'terminal' })
  const text = shown(await ui.drawn())
  expect(text).toContain('70%')
  expect(text).toContain('80%')
})

test('Readings are stored with their time, source, Unused Allowance and a Reset snapped to the minute', async ($, on) => {
  const w = engine(on)
  await start($)
  await $.session.measure({
    context: {} as never, changed: ['rateLimits'],
    rateLimits: [limit('five_hour', 38, NOW + 2 * H + 31_000)],
  })
  expect(w.store.get('readings:five_hour')).toEqual([
    { at: NOW, source: 'session', left: 62, resetsAt: NOW + 2 * H + MIN },
  ])
})

test('old Readings are pruned: 5-hour after 7 days, weekly after 4 weeks', async ($, on) => {
  const old = (days: number) => ({ at: NOW - days * DAY, source: 'session', left: 50, resetsAt: NOW - days * DAY + H })
  const w = engine(on, {
    store: {
      'readings:five_hour': [old(8), old(6)],
      'readings:seven_day': [old(29), old(27)],
    },
  })
  await start($)
  await $.session.measure({
    context: {} as never, changed: ['rateLimits'],
    rateLimits: [limit('five_hour', 38, NOW + 2 * H), limit('seven_day', 50, NOW + 3 * DAY)],
  })
  expect((w.store.get('readings:five_hour') as { at: number }[]).map(r => r.at)).toEqual([NOW - 6 * DAY, NOW])
  expect((w.store.get('readings:seven_day') as { at: number }[]).map(r => r.at)).toEqual([NOW - 27 * DAY, NOW])
})

test('a Reading another session wrote is picked up, and writes merge rather than overwrite', async ($, on) => {
  const w = engine(on)
  await start($)
  await $.session.measure({
    context: {} as never, changed: ['rateLimits'],
    rateLimits: [limit('five_hour', 38, NOW + 2 * H)],
  })
  // Another session writes a newer Reading.
  const theirs = { at: NOW + MIN, source: 'api', left: 55, resetsAt: NOW + 2 * H }
  w.store.set('readings:five_hour', [...(w.store.get('readings:five_hour') as unknown[]), theirs])
  await w.clock.advance(MIN)
  const ui = await $.ui.mount({ ...w.pane, surface: 'terminal' })
  expect(shown(await ui.drawn())).toContain('55%')

  // Meanwhile that session overwrote the log with only its own Reading; ours comes back on our next write.
  w.store.set('readings:five_hour', [theirs])
  await w.clock.advance(MIN)
  await $.session.measure({
    context: {} as never, changed: ['rateLimits'],
    rateLimits: [limit('five_hour', 50, NOW + 2 * H)],
  })
  expect((w.store.get('readings:five_hour') as { at: number }[]).map(r => r.at)).toEqual([NOW, NOW + MIN, NOW + 2 * MIN])
})
