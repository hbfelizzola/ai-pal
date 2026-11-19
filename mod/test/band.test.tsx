// #24 The band above the prompt.
import { expect, test, type Engine } from 'claude-code/testing'
import { DAY, H, MIN, NOW, SURFACES, engine, limit, shown, type World } from './engine'

const start = async ($: Engine, w: World) => {
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  await w.clock.settle()
}
const measure = ($: Engine, ...rateLimits: ReturnType<typeof limit>[]) =>
  $.session.measure({ context: {} as never, changed: ['rateLimits'], rateLimits })
const slots = (end: number, count: number) => Array.from({ length: count }, (_, i) => Math.floor(end / (5 * MIN)) - i)
const r = (at: number, left: number, resetsAt: number) => ({ at, source: 'api', left, resetsAt })

const band = async ($: Engine, w: World, surface: 'terminal' | 'desktop') => {
  const ui = await $.ui.mount({ ...w.band, surface })
  const text = shown(await ui.drawn())
  await ui.unmount()
  return text
}

/**
 * 14 h of Active Use in 7 days (2 h a day). 5-hour: 252% spent, 18%/h; 48% left,
 * 2 h to Reset. Weekly: 44.1% spent, 3.15%/h = 6.3%/day; 15% left, 3 days to Reset.
 */
const busyWeek = {
  active: slots(NOW, 168),
  'readings:five_hour': [
    r(NOW - 6 * DAY, 100, NOW - 6 * DAY + 5 * H), r(NOW - 6 * DAY + 4 * H, 0, NOW - 6 * DAY + 5 * H),
    r(NOW - 3 * DAY, 100, NOW - 3 * DAY + 5 * H), r(NOW - 3 * DAY + 4 * H, 0, NOW - 3 * DAY + 5 * H),
    r(NOW - 2 * H, 100, NOW + 2 * H), r(NOW, 48, NOW + 2 * H),
  ],
  'readings:seven_day': [r(NOW - 6 * DAY, 59.1, NOW + 3 * DAY), r(NOW, 15, NOW + 3 * DAY)],
}

test('four bars: per window, the Unused Allowance over a speed bar with the rate and the Pace Call', async ($, on) => {
  const w = engine(on, { store: busyWeek })
  await start($, w)
  for (const surface of SURFACES) {
    const text = await band($, w, surface)
    expect(text).toContain('48%')
    expect(text).toContain('18%/h · Use more')
    expect(text).toContain('15%')
    expect(text).toContain('6.3%/day · On track')
  }
  const desk = await band($, w, 'desktop')
  // The labels: `5-hour 48% · 2h 0m` with the % in the window's colour.
  expect(desk).toContain('5-hour </tspan><tspan fill="#E0703F" font-weight="650">48%</tspan><tspan fill="#8E8E8E"> · 2h 0m')
  // The why on hover.
  expect(desk).toContain('Use more, or a bigger model: ~12% would go unused even nonstop · resets in 2h 0m')
  expect(desk).toContain('spends it in')
  // Bars 10px tall: two tracks and two speed bars at least.
  expect((desk.match(/height="10"/g) ?? []).length).toBeGreaterThanOrEqual(4)
})

test('the terminal gets one text line per window', async ($, on) => {
  const w = engine(on, { store: busyWeek })
  await start($, w)
  const ui = await $.ui.mount({ ...w.band, surface: 'terminal' })
  const lines = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => /^(5-hour|Weekly) /.test(t))
  expect(lines).toEqual([
    '5-hour 48% · 2h 0m · 18%/h · Use more (~12% would go unused even nonstop · resets in 2h 0m)',
    'Weekly 15% · Fri 14:00 · 6.3%/day · On track (spends it in ~4.8 h of use · 3d 0h left)',
  ])
})

test('under 1 h of Active Use the speed bar is a countdown to Reset labelled Burn Rate after 1 h', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await measure($, limit('five_hour', 38, NOW + 2 * H), limit('seven_day', 53, NOW + 3 * DAY))
  for (const surface of SURFACES) {
    const text = await band($, w, surface)
    expect(text).toContain('62%')
    expect(text).toContain('Burn Rate after 1 h')
  }
})

test('a stale bar fades, gets a ~ and its age; a passed Reset is a dashed bar labelled Reset', async ($, on) => {
  const w = engine(on, {
    store: {
      'readings:five_hour': [r(NOW - 45 * MIN, 62, NOW + 2 * H + 24 * MIN)],
      'readings:seven_day': [r(NOW - 3 * H, 40, NOW - MIN)],
    },
  })
  await start($, w)
  for (const surface of SURFACES) {
    const text = await band($, w, surface)
    expect(text).toContain('~62% · 2h 24m · 45m old')
    expect(text).toContain('Weekly Reset')
    expect(text).not.toContain('40%')
  }
  const desk = await band($, w, 'desktop')
  expect(desk).toContain('opacity="0.4"')
  expect(desk).toContain('stroke-dasharray')
})

test('with nothing stored the band is hidden', async ($, on) => {
  const w = engine(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await start($, w)
  for (const surface of SURFACES) {
    const text = await band($, w, surface)
    expect(text).toContain('engine')
    expect(text).not.toContain('5-hour')
  }
})

/** Every node in a drawing that matches. */
function nodes(node: unknown, is: (o: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    const o = n as Record<string, unknown>
    if (is(o)) out.push(o)
    Object.values(o).forEach(walk)
  }
  walk(node)
  return out
}

test('on the desktop the band is images, so its redraws swap without a blank, with the why in a card shown on hover', async ($, on) => {
  const w = engine(on, { store: busyWeek })
  await start($, w)
  const ui = await $.ui.mount({ ...w.band, surface: 'desktop' })
  const tree = await ui.drawn()
  await ui.unmount()
  const images = nodes(tree, o => o.type === 'Svg').map(o => o.props as Record<string, unknown>)
  // One image per window, none an interactive frame.
  expect(images.length).toBe(2)
  expect(images.map(o => o.isInteractive === true)).toEqual([false, false])
  // Each window's why waits hidden in a card the pointer reveals.
  const cards = nodes(tree, o => (o.props as { display?: string } | undefined)?.display === 'none' && (o.hover as { display?: string } | undefined)?.display === 'flex')
  expect(cards.length).toBe(2)
  // Each card shares a hover scope with its column alone: the desktop then
  // shows it in place, for exactly as long as the pointer is over that column,
  // rather than lifting it into a popover that focus or the pointer on it holds open.
  const scopes = cards.map(c => (c.hover as { scope?: string }).scope)
  expect(scopes.every(s => typeof s === 'string' && s !== '')).toBe(true)
  expect(new Set(scopes).size).toBe(2)
  for (const scope of scopes) {
    // The column lights its scope with a see-through hover; a bare `transparent` would paint it.
    expect(JSON.stringify(nodes(tree, o => (o.hover as { scope?: string } | undefined)?.scope === scope).map(o => o.hover))).not.toContain('transparent')
    const lit = nodes(tree, o => (o.hover as { scope?: string } | undefined)?.scope === scope)
    expect(lit.length).toBe(2)
    expect(nodes(lit.find(o => o !== cards[scopes.indexOf(scope)]), o => o.type === 'Svg').length).toBe(1)
  }
  expect(shown(cards[0])).toContain('Use more, or a bigger model: ~12% would go unused even nonstop · resets in 2h 0m')
  expect(shown(cards[1])).toContain('spends it in')
})
