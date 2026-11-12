import { expect, test } from 'claude-code/testing'

const pane = {
  title: 'ai-pal', isFocused: false, bodyColumns: 44, placement: 'dock',
  scroll: { offset: 0, bodyRows: 60 }, view: {},
} as const
const band = {
  hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 110,
  scroll: { offset: 0, bodyRows: 10 }, view: {},
} as const

test('every band layout x data x stale x under-1h draws on desktop and terminal', async ($, on) => {
  on('clock.now', () => ({ value: Date.parse('2026-11-11T12:00:00Z') }))
  // Stands for the engine's own band, drawn when the mod passes.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ plugin: 'ai-pal-readout-prototype', component: 'Pane', requestId: 'ai-pal', props: pane, surface: 'desktop' })
  const desk = await $.ui.mount({ plugin: 'ai-pal-readout-prototype', component: 'AbovePrompt', props: band, surface: 'desktop' })
  const term = await $.ui.mount({ plugin: 'ai-pal-readout-prototype', component: 'AbovePrompt', props: band, surface: 'terminal' })
  for (let s = 0; s < 4; s++) {
    for (const flip of ['stale', 'noburn', 'stale', 'noburn']) {
      for (let v = 0; v < 5; v++) {
        expect(await desk.drawn()).toMatchObject({ type: 'Box' })
        expect(await term.drawn()).toMatchObject({ type: 'Box' })
        await ui.press({ key: 'next' })
      }
      await ui.press({ key: flip })
    }
    await ui.press({ key: 'scn' })
  }
  // Typical week overruns the 5-hour Reset: the amber hatch is drawn.
  expect(JSON.stringify(await desk.drawn())).toContain('url(#hatch)')
  // Quiet week (< 1 h Active Use) shows the muted Burn Rate note.
  await ui.press({ key: 'scn' })
  expect(JSON.stringify(await desk.drawn())).toContain('Burn Rate after 1 h')
  // Band off passes to what's beneath.
  await ui.press({ key: 'bandon' })
  expect(JSON.stringify(await desk.drawn())).toContain('engine')
})

test('the history pane still pages its rows', async ($, on) => {
  on('clock.now', () => ({ value: Date.parse('2026-11-11T12:00:00Z') }))
  const ui = await $.ui.mount({ plugin: 'ai-pal-readout-prototype', component: 'Pane', requestId: 'ai-pal', props: pane, surface: 'desktop' })
  const count = async () => (JSON.stringify(await ui.drawn()).match(/% lost|no data/g) ?? []).length
  const before = await count()
  await ui.press({ key: 'more-five_hour' })
  expect(await count()).toBeGreaterThan(before)
  await ui.press({ key: 'less-five_hour' })
  expect(await count()).toBe(before)
})
