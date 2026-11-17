// #28 The `/ai-pal` command.
import { expect, test, type Engine } from 'claude-code/testing'
import { DAY, NOW, SURFACES, at, engine, limit, nudgeKey, shown, type World } from './engine'

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

const FIVE_RESET = at(0, 16, 12)
const WEEK_RESET = at(3, 18)

test('/ai-pal is registered when a session starts', async ($, on) => {
  const w = engine(on)
  await start($, w)
  expect(w.registered).toContain('ai-pal')
})

test('/ai-pal lists every setting with its default, each booked Nudge in full, and why a window has none', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await measure($, limit('five_hour', 38, FIVE_RESET), limit('seven_day', 80, WEEK_RESET))
  const reply = await aiPal($)
  for (const line of [
    'nudges: on (default on)',
    '5h-threshold: 40% (default 40%)',
    'weekly-threshold: 30% (default 30%)',
    'quiet-hours: 23:00-08:00 (default 23:00-08:00)',
    'band: on (default on)',
    '5-hour, 1 h before · Tue 15:12',
    '    5-hour: 62% left as of 14:00, resets in 1h. Use it before it\'s gone.',
    'Weekly: 20% left, under the 30% threshold',
  ]) expect(reply).toContain(line)
})

test('/ai-pal set changes one setting, re-evaluates at once and says what was booked or cancelled', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await measure($, limit('five_hour', 38, FIVE_RESET))
  const reply = await aiPal($, 'set 5h-threshold 70')
  expect(reply).toContain('5h-threshold is now 70% (default 40%).')
  expect(reply).toContain('Cancelled: 5-hour, 1 h before · Tue 15:12')
  expect(w.cancelled).toEqual([nudgeKey('five_hour', FIVE_RESET, '1h')])
  expect(await aiPal($)).toContain('5-hour: 62% left, under the 70% threshold')
})

test('changing Quiet Hours moves a moved weekly Nudge back', async ($, on) => {
  const w = engine(on)
  await start($, w)
  const reset = at(3, 5) // due Thu 05:00 and Fri 02:00, both inside the default Quiet Hours
  await measure($, limit('seven_day', 50, reset))
  expect(w.notified.map(n => n.at)).toEqual([at(1, 22, 55), at(2, 22, 55)])
  const reply = await aiPal($, 'set quiet-hours 01:00-04:00')
  expect(reply).toContain('quiet-hours is now 01:00-04:00 (default 23:00-08:00).')
  expect(reply).toContain('Booked: Weekly, 24 h before · Thu 05:00')
  expect(reply).toContain('Booked: Weekly, 3 h before · Fri 00:55')
  expect(w.notified.slice(2).map(n => n.at)).toEqual([at(2, 5), at(3, 0, 55)])
})

test('bad input changes nothing and names the accepted values', async ($, on) => {
  const w = engine(on)
  await start($, w)
  expect(await aiPal($, 'set 5h-threshold 3')).toContain('5h-threshold takes a whole % from 5 to 100 (`40` or `40%`), or `off`. Nothing changed.')
  expect(await aiPal($, 'set quiet-hours 08:00-08:00')).toContain('Nothing changed.')
  expect(await aiPal($, 'set volume 11')).toContain('Settings: nudges, 5h-threshold, weekly-threshold, quiet-hours, band. Nothing changed.')
  expect(await aiPal($, 'frobnicate')).toContain('Usage: /ai-pal, /ai-pal set <setting> <value>, /ai-pal reset [setting]')
  expect(w.store.get('settings')).toBeUndefined()
})

test('/ai-pal reset restores one setting, or all of them', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await aiPal($, 'set 5h-threshold off')
  await aiPal($, 'set weekly-threshold 50%')
  expect(await aiPal($, 'reset 5h-threshold')).toContain('5h-threshold is now 40% (default 40%).')
  expect(await aiPal($)).toContain('weekly-threshold: 50% (default 30%)')
  expect(await aiPal($, 'reset')).toContain('All settings are back to their defaults.')
  expect(await aiPal($)).toContain('weekly-threshold: 30% (default 30%)')
})

test('band off hides the band; nudges off cancels every booked Nudge', async ($, on) => {
  const w = engine(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await start($, w)
  await measure($, limit('five_hour', 38, FIVE_RESET), limit('seven_day', 60, WEEK_RESET))
  await aiPal($, 'set band off')
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...w.band, surface })
    expect(shown(await ui.drawn())).not.toContain('5-hour')
    await ui.unmount()
  }
  const reply = await aiPal($, 'set nudges off')
  expect(reply).toContain('nudges is now off (default on).')
  expect(w.cancelled.sort()).toEqual([
    nudgeKey('five_hour', FIVE_RESET, '1h'), nudgeKey('seven_day', WEEK_RESET, '24h'), nudgeKey('seven_day', WEEK_RESET, '3h'),
  ].sort())
  expect(await aiPal($)).toContain('Nudges are off')
})

test('settings dropped after a month without use are reported once', async ($, on) => {
  const w = engine(on, { store: { seen: NOW - 31 * DAY, settings: { '5h-threshold': '70%' } } })
  await start($, w)
  const first = await aiPal($)
  expect(first).toContain('ai-pal went unused for over 30 days, so its data was cleared and its settings are back to the defaults.')
  expect(first).toContain('5h-threshold: 40% (default 40%)')
  expect(await aiPal($)).not.toContain('went unused')
})
