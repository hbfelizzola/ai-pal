import { expect, test } from 'claude-code/testing'

const pane = {
  title: 'ai-pal', isFocused: false, bodyColumns: 44, placement: 'dock',
  scroll: { offset: 0, bodyRows: 60 }, view: {},
} as const

test('every gauge layout x data draws on desktop and terminal', async ($, on) => {
  on('clock.now', () => ({ value: Date.parse('2026-11-11T12:00:00Z') }))
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'ai-pal-readout-prototype', component: 'Pane', requestId: 'ai-pal', props: pane, surface })
    const seen = new Set<string>()
    for (let s = 0; s < 5; s++) {
      for (const flip of ['next', 'stale', 'next', 'stale']) {
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

test('the band draws four bars for every scenario, fresh and stale, and passes when off', async ($, on) => {
  on('clock.now', () => ({ value: Date.parse('2026-11-11T12:00:00Z') }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const band = {
    hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 110,
    scroll: { offset: 0, bodyRows: 10 }, view: {},
  } as const
  const ui = await $.ui.mount({ plugin: 'ai-pal-readout-prototype', component: 'Pane', requestId: 'ai-pal', props: pane, surface: 'desktop' })
  const desk = await $.ui.mount({ plugin: 'ai-pal-readout-prototype', component: 'AbovePrompt', props: band, surface: 'desktop' })
  const term = await $.ui.mount({ plugin: 'ai-pal-readout-prototype', component: 'AbovePrompt', props: band, surface: 'terminal' })
  let hatched = false
  for (let s = 0; s < 5; s++) {
    for (const flip of ['stale', 'speedbar', 'stale', 'speedbar']) {
      const d = JSON.stringify(await desk.drawn())
      expect(d).toContain('Svg')
      expect((d.match(/<rect x=/g) ?? []).length).toBeGreaterThanOrEqual(6)
      hatched ||= d.includes('url(#hatch)')
      expect(JSON.stringify(await term.drawn())).toContain('Weekly')
      await ui.press({ key: flip })
    }
    await ui.press({ key: 'scn' })
  }
  expect(hatched).toBe(true)
  await ui.press({ key: 'bandon' })
  expect(JSON.stringify(await desk.drawn())).toContain('engine')
})
