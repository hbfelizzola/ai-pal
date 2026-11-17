// The Readout: the docked Pane (split ring, model rows, Burn Rate
// speedometer, footnote) and the band above the prompt.
import type { EngineInterface, RenderInput } from 'claude-code'
import type { EndpointState } from '../types'
import type { Log, WindowId } from './log'
import { COOL, WARM, type Pair } from './look'
import { ringSvg, type Half } from './ring'
import { standing } from './standing'
import { resetLabel, until } from './time'

export const WINDOWS = {
  five_hour: { name: '5-hour', colors: WARM },
  seven_day: { name: 'Weekly', colors: COOL },
} as const satisfies Record<string, { name: string; colors: Pair }>
export type MainWindow = keyof typeof WINDOWS

/** Everything one drawing reads. */
export type Scene = { log: Log; now: number; endpoint: EndpointState }

const pct = (n: number) => `${Math.round(n)}%`

export function half(scene: Scene, id: MainWindow): Half {
  const { name } = WINDOWS[id]
  const s = standing(scene.log, id, scene.now)
  if (s.state !== 'read') return { big: '…', label: name, isDashed: true, isFaded: false, isNudgeBooked: false }
  const { left, resetsAt } = s.reading
  return {
    fill: left,
    big: pct(left),
    label: `${name} · ${resetLabel(resetsAt, scene.now)}`,
    tip: `${name} · ${pct(left)} left · resets in ${until(resetsAt - scene.now)}`,
    isDashed: false,
    isFaded: false,
    isNudgeBooked: false,
  }
}

export function drawPane($: EngineInterface, e: RenderInput<'Pane'>, scene: Scene) {
  const { Box, Text } = $.ui.resolve(e)
  const five = half(scene, 'five_hour')
  const week = half(scene, 'seven_day')
  const alt = [five, week].map(x => `${x.big} ${x.label}`).join('; ')

  const ring = e.surface !== 'terminal'
    ? svg($, e, ringSvg(180, five, week), alt, 180, 180)
    : (
      <Box flexDirection="column">
        {([[five, WARM], [week, COOL]] as const).map(([x, c]) => (
          <Text dimColor={x.isFaded}>
            <Text color={x.isDashed ? undefined : c[1]} bold>{x.big}</Text> <Text dimColor>{x.label}</Text>
          </Text>
        ))}
      </Box>
    )

  return (
    <Box flexDirection="column" alignItems="center" gap={1}>
      {ring}
    </Box>
  )
}

/** An Svg where the surface draws one; the terminal gets the same figures as text instead. */
function svg($: EngineInterface, e: RenderInput<'Pane' | 'AbovePrompt'>, source: string, alt: string, width: number, height: number) {
  if (e.surface === 'terminal') return null
  const { Svg } = $.ui.resolve(e)
  return <Svg isInteractive source={source} alt={alt} width={width} height={height} />
}

export const mainWindows = Object.keys(WINDOWS) as WindowId[]
