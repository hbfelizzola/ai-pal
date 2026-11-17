// #22 Model-specific weekly rows under the ring.
import { expect, test, type Engine } from 'claude-code/testing'
import { DAY, H, MIN, NOW, SURFACES, at, engine, limitsReply, shown, type World } from './engine'

const start = async ($: Engine, w: World) => {
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  await w.clock.settle()
}
const rowOf = async ($: Engine, w: World, surface: 'terminal' | 'desktop', name: string) => {
  const ui = await $.ui.mount({ ...w.pane, surface })
  const row = await ui.find({ type: 'Text', text: new RegExp(`^${name}:`) })
  await ui.unmount()
  return row
}

test('a model whose share the weekly window caps more tightly says how much weekly allows', async ($, on) => {
  const w = engine(on)
  w.signIn()
  // Weekly: 30% left; Fable may use 50% of the weekly cap and has 90% of its own share left.
  w.reply(limitsReply({ five: [10, NOW + 3 * H], week: [70, at(3, 1)], models: [{ name: 'Fable', used: 10, reset: at(3, 1), share: 50 }] }))
  await start($, w)
  for (const surface of SURFACES) expect((await rowOf($, w, surface, 'Fable'))?.text).toBe('Fable: 90% of its share left · weekly allows 60%')
})

test('when its own share is the tighter cap, the row gives only its own Unused Allowance', async ($, on) => {
  const w = engine(on)
  w.signIn()
  w.reply(limitsReply({ week: [20, at(3, 1)], models: [{ name: 'Fable', used: 10, reset: at(3, 1), share: 50 }] }))
  await start($, w)
  for (const surface of SURFACES) expect((await rowOf($, w, surface, 'Fable'))?.text).toBe('Fable: 90% of its share left')
})

test('no rows when no model-specific window is reported', async ($, on) => {
  const w = engine(on)
  w.signIn()
  w.reply(limitsReply({ five: [10, NOW + 3 * H], week: [70, at(3, 1)] }))
  await start($, w)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...w.pane, surface })
    expect(shown(await ui.drawn())).not.toContain('of its share left')
    await ui.unmount()
  }
})

test('rows fade with the arcs when stale and disappear when the endpoint is off', async ($, on) => {
  const w = engine(on)
  w.signIn()
  w.reply(limitsReply({ week: [70, at(3, 1)], models: [{ name: 'Fable', used: 10, reset: at(3, 1), share: 50 }] }), { status: 503, text: '' })
  await start($, w)
  await w.clock.advance(20 * MIN) // two busy replies later, the Reading is 20 min old
  for (const surface of SURFACES) {
    const row = await rowOf($, w, surface, 'Fable')
    expect(row?.text).toBe('Fable: ~90% of its share left · weekly allows 60%')
    expect(row?.props.dimColor).toBe(true)
  }
  w.reply({ status: 401, text: '' })
  await w.clock.advance(DAY)
  for (const surface of SURFACES) expect(await rowOf($, w, surface, 'Fable')).toBeUndefined()
})
