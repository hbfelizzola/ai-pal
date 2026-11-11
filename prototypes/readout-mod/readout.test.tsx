import { expect, test } from 'claude-code/testing'

const props = {
  title: 'ai-pal', isFocused: false, bodyColumns: 44, placement: 'dock',
  scroll: { offset: 0, bodyRows: 60 }, view: {},
} as const

test('every layout x history scenario draws on desktop', async ($, on) => {
  on('clock.now', () => ({ value: Date.parse('2026-11-11T12:00:00Z') }))
  const ui = await $.ui.mount({ plugin: 'ai-pal-readout-prototype', component: 'Pane', requestId: 'ai-pal', props, surface: 'desktop' })
  for (let s = 0; s < 4; s++) {
    for (let v = 0; v < 4; v++) {
      expect(await ui.drawn()).toMatchObject({ type: 'Box' })
      await ui.press({ key: 'next' })
    }
    await ui.press({ key: 'scn' })
  }
})
