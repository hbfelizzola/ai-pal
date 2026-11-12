import { expect, test } from 'claude-code/testing'

const pane = {
  title: 'ai-pal', isFocused: false, bodyColumns: 44, placement: 'dock',
  scroll: { offset: 0, bodyRows: 60 }, view: {},
} as const

test('every gauge layout x data x time bars draws on desktop and terminal', async ($, on) => {
  on('clock.now', () => ({ value: Date.parse('2026-11-11T12:00:00Z') }))
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'ai-pal-readout-prototype', component: 'Pane', requestId: 'ai-pal', props: pane, surface })
    const seen = new Set<string>()
    for (let s = 0; s < 5; s++) {
      for (const flip of ['next', 'bars', 'next', 'bars']) {
        const drawn = JSON.stringify(await ui.drawn())
        for (const word of ['Use more', 'On track', 'Ease off', 'Burn Rate after 1 h']) if (drawn.includes(word)) seen.add(word)
        await ui.press({ key: flip })
      }
      await ui.press({ key: 'scn' })
    }
    // The five scenarios reach all three calls and the no-Burn-Rate state.
    expect([...seen].sort()).toEqual(['Burn Rate after 1 h', 'Ease off', 'On track', 'Use more'])
    await ui.unmount()
  }
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
