// #21 Stale, missing and passed-Reset states in the Pane.
import { expect, test, type Engine } from 'claude-code/testing'
import { DAY, H, MIN, NOW, SURFACES, engine, limit, limitsReply, shown, type World } from './engine'

const AMBER = '#E5A50A'
const start = async ($: Engine, w: World) => {
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  await w.clock.settle()
}
const measure = ($: Engine, ...rateLimits: ReturnType<typeof limit>[]) =>
  $.session.measure({ context: {} as never, changed: ['rateLimits'], rateLimits })
const api = (minsAgo: number, left: number, resetsAt: number) =>
  ({ at: NOW - minsAgo * MIN, source: 'api', left, resetsAt })

async function look($: Engine, w: World, surface: 'terminal' | 'desktop') {
  const ui = await $.ui.mount({ ...w.pane, surface })
  const foot = await ui.find({ type: 'Text', text: /^(Updated|Checking usage|No reading yet)/ })
  const text = shown(await ui.drawn())
  await ui.unmount()
  return { foot: foot?.text, isAmber: foot?.props.color === AMBER, text }
}

test('the footnote always says how old the figures are, muted while they can be trusted', async ($, on) => {
  const w = engine(on)
  w.signIn()
  w.reply(limitsReply({ five: [38, NOW + 3 * H], week: [53, NOW + 3 * DAY] }))
  await start($, w)
  await w.clock.advance(2 * MIN)
  for (const surface of SURFACES) {
    const seen = await look($, w, surface)
    expect(seen.foot).toBe('Updated 2m ago')
    expect(seen.isAmber).toBe(false)
  }
})

test('session data only is named, still muted, when the endpoint is off', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await measure($, limit('five_hour', 38, NOW + 3 * H), limit('seven_day', 53, NOW + 3 * DAY))
  await w.clock.advance(6 * MIN)
  for (const surface of SURFACES) {
    const seen = await look($, w, surface)
    expect(seen.foot).toBe('Updated 6m ago · session data only')
    expect(seen.isAmber).toBe(false)
  }
})

test('a stale Reading fades with a ~, and the footnote turns amber with the reason', async ($, on) => {
  // Last read at 13:15 by the endpoint, which is now busy and asks for 32 minutes.
  const w = engine(on, {
    store: {
      'readings:five_hour': [api(45, 62, NOW + 2 * H + 24 * MIN)],
      'readings:seven_day': [api(45, 47, NOW + 3 * DAY)],
    },
  })
  w.signIn()
  w.reply({ status: 429, text: '', headers: { 'retry-after': String(32 * 60) } })
  await start($, w)
  for (const surface of SURFACES) {
    const seen = await look($, w, surface)
    expect(seen.foot).toBe('Updated 45m ago · Usage API busy (429), retrying at 14:32')
    expect(seen.isAmber).toBe(true)
    expect(seen.text).toContain('~62%')
    expect(seen.text).toContain('~47%')
  }
  const { text } = await look($, w, 'desktop')
  expect(text).toContain('<title>5-hour · 62% left as of 13:15 (45m ago, usage API) · resets in 2h 24m</title>')
  expect(text).toContain('opacity="0.4"')
})

test('a window whose Reset passed with no new Reading shows a dashed Reset, never an assumed full window', async ($, on) => {
  const w = engine(on, {
    store: {
      'readings:five_hour': [api(40, 62, NOW - 10 * MIN)],
      'readings:seven_day': [api(2, 47, NOW + 3 * DAY)],
    },
  })
  await start($, w)
  for (const surface of SURFACES) {
    const seen = await look($, w, surface)
    expect(seen.text).toContain('Reset')
    expect(seen.text).toContain('5-hour · new window')
    expect(seen.text).not.toContain('62%')
    expect(seen.text).not.toContain('100%')
    expect(seen.isAmber).toBe(true)
    expect(seen.foot).toContain('5-hour reset, waiting for a Reading')
  }
  expect((await look($, w, 'desktop')).text).toContain('stroke-dasharray')

  // A Reading of the new window brings the figure back.
  await measure($, limit('five_hour', 5, NOW + 5 * H))
  expect((await look($, w, 'terminal')).text).toContain('95%')
})

test('before the first Reading: dashed …, Checking usage…', async ($, on) => {
  const w = engine(on)
  w.signIn()
  w.reply(limitsReply({ five: [38, NOW + 3 * H] }))
  w.slowReplies(10_000)
  // Before the poll is answered.
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...w.pane, surface })
    const text = shown(await ui.drawn())
    expect(text).toContain('…')
    expect(text).toContain('Checking usage…')
    await ui.unmount()
  }
})

test('both sources failed: No reading yet: send a message', async ($, on) => {
  const w = engine(on)
  w.signIn()
  w.reply({ status: 403, text: '' })
  await start($, w)
  for (const surface of SURFACES) {
    const seen = await look($, w, surface)
    expect(seen.foot).toBe('No reading yet: send a message')
    expect(seen.text).toContain('…')
  }
})

test('one window missing: that half is dashed with …, and the footnote names it', async ($, on) => {
  const w = engine(on)
  w.signIn()
  w.reply(limitsReply({ five: [38, NOW + 3 * H] }))
  await start($, w)
  for (const surface of SURFACES) {
    const seen = await look($, w, surface)
    expect(seen.foot).toBe('Updated just now · no weekly Reading yet')
    expect(seen.text).toContain('62%')
    expect(seen.text).toContain('…')
  }
})
