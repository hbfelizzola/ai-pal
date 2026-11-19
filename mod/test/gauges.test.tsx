// The Pane's gauges: by default a column of four same-size dials, a fuel gauge
// and a Burn Rate speedometer per window, with live countdown clocks; the
// `gauges` setting picks fuel-gauge rings, needle dials or the split ring.
import { expect, test, type Engine } from 'claude-code/testing'
import { DAY, H, MIN, NOW, at, engine, limit, shown, type World } from './engine'

const start = async ($: Engine, w: World) => {
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  await w.clock.settle()
}
const measure = ($: Engine, ...rateLimits: ReturnType<typeof limit>[]) =>
  $.session.measure({ context: {} as never, changed: ['rateLimits'], rateLimits })
const turn = ($: Engine, durationMs: number) =>
  $.turn.complete({ answer: '', durationMs, isAborted: false, turnId: `t${Math.random()}`, reason: 'answer' })
const aiPal = async ($: Engine, args = '') =>
  (await $.command.run({
    command: 'ai-pal', args, origin: { kind: 'composer' } as never, presentation: { isFullscreen: false, columns: 100 },
  })).text ?? ''
const desktop = async ($: Engine, w: World) => {
  const ui = await $.ui.mount({ ...w.pane, surface: 'desktop' })
  const text = shown(await ui.drawn())
  await ui.unmount()
  return text
}
const count = (text: string, part: string) => text.split(part).length - 1
/** Each square dial's size in px, from its viewBox. */
const sizes = (text: string) => [...text.matchAll(/viewBox="0 0 (\d+) (\d+)"/g)].filter(m => m[1] === m[2]).map(m => Number(m[1]))

/** 38% of the 5-hour window used with 3h 9m to its Reset; 53% of the weekly, resetting Fri 01:00. */
const usual = ($: Engine) => measure($, limit('five_hour', 38, NOW + 3 * H + 9 * MIN), limit('seven_day', 53, at(3, 1)))

test('by default the desktop Pane is a column of four same-size dials: a fuel gauge and a speedometer per window', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await usual($)
  const text = await desktop($, w)
  const s = sizes(text)
  expect(s.length).toBe(4)
  expect(new Set(s).size).toBe(1)
  // Each fuel gauge: what's left, E and F, and the clock counting down to its Reset.
  expect(text).toContain('62%')
  expect(text).toContain('3:09:00')
  expect(text).toContain('47%')
  expect(text).toContain('2d 11:00:00')
  expect(count(text, '>E<')).toBe(2)
  expect(count(text, '>F<')).toBe(2)
  expect(text).toContain('5-hour · resets in')
  expect(text).toContain('Weekly · resets in')
  // A speedometer for each window, the weekly one new.
  expect(text).toContain('5-hour · Burn Rate')
  expect(text).toContain('Weekly · Burn Rate')
  // The arcs keep their tooltips.
  expect(text).toContain('<title>5-hour · 62% left · resets in 3h 9m</title>')
})

/** Every Svg in a drawing: its markup and whether it is interactive. */
function svgs(node: unknown): { source: string; isInteractive: boolean }[] {
  const out: { source: string; isInteractive: boolean }[] = []
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    const o = n as Record<string, unknown>
    if (typeof o.source === 'string' && o.source.startsWith('<svg')) out.push({ source: o.source, isInteractive: o.isInteractive === true })
    Object.values(o).forEach(walk)
  }
  walk(node)
  return out
}

test('every dial of a look draws its scale at one radius, so all four are the same width', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await usual($)
  for (const look of ['fuel', 'needle']) {
    await aiPal($, `set gauges ${look}`)
    const ui = await $.ui.mount({ ...w.pane, surface: 'desktop' })
    const dials = svgs(await ui.drawn())
    expect(dials.length).toBe(4)
    // The first arc each draws is its scale's track.
    const radii = dials.map(d => /A ([\d.]+) \1 /.exec(d.source)?.[1])
    expect(radii[0]).toBeDefined()
    expect(new Set(radii).size).toBe(1)
    await ui.unmount()
  }
})

test('the dials fill the Pane\'s height, as wide as it allows', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await usual($)
  const sized = async (bodyColumns: number, bodyRows: number) => {
    const ui = await $.ui.mount({ ...w.pane, props: { ...w.pane.props, bodyColumns, scroll: { offset: 0, bodyRows } }, surface: 'desktop' })
    const text = shown(await ui.drawn())
    await ui.unmount()
    return sizes(text)
  }
  // 62 rows of 16px less the gaps, the footnote and a row to spare: 56 rows for four dials.
  expect(await sized(42, 62)).toEqual([224, 224, 224, 224])
  // A narrow Pane caps them at its width (8px a column).
  expect(await sized(20, 200)).toEqual([160, 160, 160, 160])
  // A short one never shrinks them below 120px; the Pane scrolls instead.
  expect(await sized(42, 20)).toEqual([120, 120, 120, 120])
})

test('the dials are images, not frames, so the per-second redraw swaps them without a blank', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await usual($)
  const ui = await $.ui.mount({ ...w.pane, surface: 'desktop' })
  const dials = svgs(await ui.drawn())
  expect(dials.map(d => d.isInteractive)).toEqual([false, false, false, false])
  await ui.unmount()
})

test('the countdown clocks tick every second', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await usual($)
  const ui = await $.ui.mount({ ...w.pane, surface: 'desktop' })
  expect(shown(await ui.drawn())).toContain('3:09:00')
  await w.clock.advance(1000)
  const later = shown(await ui.drawn())
  expect(later).toContain('3:08:59')
  expect(later).toContain('2d 10:59:59')
  await ui.unmount()
})

test('a weekly Reset under a day away counts down in hours', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await measure($, limit('seven_day', 69, NOW + 20 * H + 7 * MIN))
  expect(await desktop($, w)).toContain('20:07:00')
})

test('the weekly speedometer shows the weekly Burn Rate in %/day', async ($, on) => {
  const reset = NOW + 3 * DAY
  const w = engine(on, { now: NOW - 2 * H })
  await start($, w)
  await w.clock.set(NOW - H)
  await turn($, 25 * MIN)
  await measure($, limit('five_hour', 10, NOW + 3 * H), limit('seven_day', 20, reset))
  await w.clock.set(NOW)
  await turn($, 35 * MIN)
  await measure($, limit('five_hour', 28, NOW + 3 * H), limit('seven_day', 26, reset))
  const text = await desktop($, w)
  expect(text).toMatch(/Weekly Burn Rate [\d.]+%\/day/)
  expect(text).toContain('%/day')
})

test('without a Reading the fuel gauges wait with dashed tracks and no clock', async ($, on) => {
  const w = engine(on)
  await start($, w)
  const text = await desktop($, w)
  expect(count(text, '>…<')).toBe(2)
  expect(text).toContain('stroke-dasharray')
  expect(text).not.toMatch(/\d:\d\d:\d\d/)
})

test('/ai-pal set gauges needle draws needle dials of the same size', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await usual($)
  expect(await aiPal($, 'set gauges needle')).toContain('gauges is now needle (default fuel).')
  const text = await desktop($, w)
  expect(sizes(text).length).toBe(4)
  expect(count(text, '>½<')).toBe(2)
  expect(text).toContain('3:09:00')
  expect(text).toContain('5-hour · Burn Rate')
  expect(text).toContain('Weekly · Burn Rate')
})

test('/ai-pal set gauges ring brings back the split ring and the 5-hour speedometer', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await usual($)
  await aiPal($, 'set gauges ring')
  const text = await desktop($, w)
  expect(count(text, 'width="210" height="210"')).toBe(1)
  expect(text).toContain('5-hour · 3h 9m')
  expect(text).not.toContain('Weekly · Burn Rate')
  expect(text).not.toContain('3:09:00')
})

test('/ai-pal lists the gauges setting and refuses a look it does not have', async ($, on) => {
  const w = engine(on)
  await start($, w)
  expect(await aiPal($)).toContain('gauges: fuel (default fuel)')
  expect(await aiPal($, 'set gauges dots')).toBe('gauges takes `fuel`, `needle` or `ring`. Nothing changed.')
})

test('the terminal Pane keeps its text readout whatever the gauges', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await usual($)
  await aiPal($, 'set gauges needle')
  const ui = await $.ui.mount({ ...w.pane, surface: 'terminal' })
  const text = shown(await ui.drawn())
  expect(text).toContain('62%')
  expect(text).toContain('5-hour · 3h 9m')
  expect(text).not.toContain('<svg')
  await ui.unmount()
})

test('a speedometer gives Use more, On track and Ease off a third of its sweep each, Ease off in red', async ($, on) => {
  // As in the Burn Rate tests: 18%/h, with zone edges at 24 and 48 (72% left, 3 h to go).
  const reset = NOW + 3 * H
  const w = engine(on, { now: NOW - 2 * H })
  await start($, w)
  await w.clock.set(NOW - H)
  await turn($, 25 * MIN)
  await measure($, limit('five_hour', 10, reset))
  await w.clock.set(NOW)
  await turn($, 35 * MIN)
  await measure($, limit('five_hour', 28, reset))
  for (const look of ['fuel', 'needle']) {
    await aiPal($, `set gauges ${look}`)
    const ui = await $.ui.mount({ ...w.pane, surface: 'desktop' })
    const speed = svgs(await ui.drawn())[1]!.source
    await ui.unmount()
    const size = Number(/viewBox="0 0 (\d+)/.exec(speed)![1])
    const at = (label: string) => {
      const m = new RegExp(`<text x="([\\d.]+)" y="([\\d.]+)"[^>]*>${label}</text>`).exec(speed)
      expect(m).not.toBeNull()
      return [Number(m![1]), Number(m![2])] as const
    }
    const [x1, y1] = at('24')
    const [x2, y2] = at('48')
    // The two edges mirror each other about the dial's centre line.
    expect(Math.abs(x1 + x2 - size)).toBeLessThan(0.3)
    expect(Math.abs(y1 - y2)).toBeLessThan(0.3)
    expect(speed).toContain('#E5484D')
  }
})
