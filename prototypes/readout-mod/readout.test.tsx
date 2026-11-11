import { expect, test } from 'claude-code/testing'

const props = {
  title: 'ai-pal', isFocused: false, bodyColumns: 44, placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 }, view: {},
} as const

for (const surface of ['desktop', 'terminal'] as const) {
  test(`every variant x scenario draws on ${surface}`, async ($, on) => {
    on('ui.toast', () => ({ value: undefined }))
    on('clock.now', () => ({ value: Date.parse('2026-11-11T12:00:00Z') }))
    const ui = await $.ui.mount({ plugin: 'ai-pal-readout-prototype', component: 'Pane', requestId: 'ai-pal', props, surface })
    for (let s = 0; s < 5; s++) {
      for (let v = 0; v < 5; v++) {
        expect(await ui.drawn()).toMatchObject({ type: 'Box' })
        await ui.press({ key: 'next' })
      }
      await ui.press({ key: 'scn' })
    }
    await ui.press({ key: 'band' })
    await ui.press({ key: 'scn' })
    const band = await $.ui.mount({ plugin: 'ai-pal-readout-prototype', component: 'AbovePrompt', props: {}, surface } as any)
    expect(await band.drawn()).toBeDefined()
  })
}
