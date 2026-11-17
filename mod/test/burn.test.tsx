// #23 Active Use, Burn Rate and the Pane speedometer.
import { expect, test, type Engine } from 'claude-code/testing'
import { DAY, H, MIN, NOW, SURFACES, engine, limit, shown, type World } from './engine'

const start = async ($: Engine, w: World) => {
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  await w.clock.settle()
}
const measure = ($: Engine, ...rateLimits: ReturnType<typeof limit>[]) =>
  $.session.measure({ context: {} as never, changed: ['rateLimits'], rateLimits })
const turn = ($: Engine, durationMs: number, agentId?: string) =>
  $.turn.complete({ answer: '', durationMs, isAborted: false, turnId: `t${Math.random()}`, reason: 'answer', ...(agentId ? { agentId } : {}) })
const pane = async ($: Engine, w: World, surface: 'terminal' | 'desktop') => {
  const ui = await $.ui.mount({ ...w.pane, surface })
  const text = shown(await ui.drawn())
  await ui.unmount()
  return text
}

/** `count` 5-minute slots of Active Use ending at `end`, as another session stored them. */
const slots = (end: number, count: number) => Array.from({ length: count }, (_, i) => Math.floor(end / (5 * MIN)) - i)

test('until there is 1 h of Active Use the dial is empty and says so', async ($, on) => {
  const w = engine(on)
  await start($, w)
  await measure($, limit('five_hour', 28, NOW + 3 * H))
  for (const surface of SURFACES) expect(await pane($, w, surface)).toContain('Burn Rate after 1 h of Active Use')
})

test('finished turns mark Active Use; 18% spent over 1 h of it is 18%/h, and 72% left with 3 h to go is Use more', async ($, on) => {
  const reset = NOW + 3 * H
  const w = engine(on, { now: NOW - 2 * H }) // 12:00
  await start($, w)
  await w.clock.set(NOW - H) // 13:00: a 25-minute turn has just finished
  await turn($, 25 * MIN)
  await measure($, limit('five_hour', 10, reset))
  await w.clock.set(NOW) // 14:00: another; a subagent's turn overlapping it adds no time
  await turn($, 10 * MIN, 'agent-1')
  await turn($, 25 * MIN)
  await measure($, limit('five_hour', 28, reset))
  for (const surface of SURFACES) {
    const text = await pane($, w, surface)
    expect(text).toContain('18%/h')
    expect(text).toContain('Use more')
    expect(text).toContain('~18% would go unused even nonstop · resets in 3h 0m')
  }
  // The dial's zone edges: r1 = 72% ÷ 3 h = 24, r2 = 48.
  const desk = await pane($, w, 'desktop')
  expect(desk).toMatch(/>24</)
  expect(desk).toMatch(/>48</)
  expect(desk).toContain('#E5A50A')
})

test('a rate that spends what is left in half to all of the time to Reset is On track', async ($, on) => {
  // 7 days hold 4 h of Active Use, 120% of 5-hour caps spent: 30%/h. 60% left, 3 h to Reset: 2 h needed.
  const w = engine(on, {
    store: {
      active: slots(NOW, 48),
      'readings:five_hour': [
        { at: NOW - 3 * DAY, source: 'api', left: 100, resetsAt: NOW - 3 * DAY + 5 * H },
        { at: NOW - 3 * DAY + 4 * H, source: 'api', left: 20, resetsAt: NOW - 3 * DAY + 5 * H },
        { at: NOW - H, source: 'api', left: 100, resetsAt: NOW + 3 * H },
      ],
    },
  })
  await start($, w)
  await measure($, limit('five_hour', 40, NOW + 3 * H))
  for (const surface of SURFACES) {
    const text = await pane($, w, surface)
    expect(text).toContain('30%/h')
    expect(text).toContain('On track')
    expect(text).toContain('spends it in ~2.0 h of use · 3h 0m left')
  }
})

test('a rate that spends what is left in under half the time to Reset is Ease off', async ($, on) => {
  // 1 h of Active Use, 40% spent: 40%/h. 30% left, 3 h to Reset: 0.75 h needed.
  const w = engine(on, {
    store: {
      active: slots(NOW, 12),
      'readings:five_hour': [{ at: NOW - 2 * H, source: 'api', left: 70, resetsAt: NOW + 3 * H }],
    },
  })
  await start($, w)
  await measure($, limit('five_hour', 70, NOW + 3 * H))
  for (const surface of SURFACES) {
    const text = await pane($, w, surface)
    expect(text).toContain('40%/h')
    expect(text).toContain('Ease off')
    expect(text).toContain('runs out after ~0.8 h of use · 3h 0m left')
  }
})

test('Active Use is pooled across sessions through the store, and kept 7 days', async ($, on) => {
  const old = Math.floor((NOW - 8 * DAY) / (5 * MIN))
  const w = engine(on, { store: { active: [old, ...slots(NOW - H, 6)] } })
  await start($, w)
  await turn($, 25 * MIN) // 6 more slots: 1 h in all
  await measure($, limit('five_hour', 28, NOW + 3 * H))
  expect(w.store.get('active')).toEqual([...slots(NOW - H, 6).reverse(), ...slots(NOW, 6).reverse()])
  expect(await pane($, w, 'terminal')).not.toContain('Burn Rate after 1 h')
})

test('a Reset that wobbles across a minute boundary between sources is still one window', async ($, on) => {
  // The endpoint read the Reset as 16:59:20 (snapped to 16:59), the session as 16:59:31 (17:00).
  const reset = NOW + 3 * H - MIN
  const w = engine(on, {
    store: {
      active: slots(NOW, 12),
      'readings:five_hour': [{ at: NOW - H, source: 'api', left: 90, resetsAt: reset }],
    },
  })
  await start($, w)
  await measure($, limit('five_hour', 28, reset + 31_000))
  expect(await pane($, w, 'terminal')).toContain('18%/h')
})
