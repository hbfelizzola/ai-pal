// The Readout: the docked Pane (split ring, model rows, Burn Rate
// speedometer, footnote) and the band above the prompt.
import type { EngineInterface, RenderInput } from 'claude-code'
import type { EndpointState } from '../types'
import type { Log, WindowId } from './log'
import { AMBER, COOL, WARM, type Pair } from './look'
import { modelLines } from './models'
import { activity, CALL_HINTS, CALL_WORDS, pace, type Pace } from './figures'
import { CALL_COLOR, gaugeSvg } from './gauge'
import { ringSvg, type Half } from './ring'
import { standing } from './standing'
import { ago, hhmm, rate, resetLabel, until } from './time'

export const WINDOWS = {
  five_hour: { name: '5-hour', colors: WARM },
  seven_day: { name: 'Weekly', colors: COOL },
} as const satisfies Record<string, { name: string; colors: Pair }>
export type MainWindow = keyof typeof WINDOWS

/** Everything one drawing reads. */
export type Scene = { log: Log; now: number; endpoint: EndpointState; slots: readonly number[] }

/** A main window's Pace Call, when there is a Burn Rate and a current figure to judge. */
export function paceOf(scene: Scene, id: MainWindow): Pace | undefined {
  const a = activity(scene.log, scene.slots, scene.now)
  const s = standing(scene.log, id, scene.now)
  if (!a || s.state !== 'read') return undefined
  return pace(id, s.reading.left, s.reading.resetsAt - scene.now, a)
}

export const pct = (n: number) => `${Math.round(n)}%`
const SOURCE_NAMES = { api: 'usage API', session: 'session data' } as const

export function half(scene: Scene, id: MainWindow): Half {
  const { name } = WINDOWS[id]
  const s = standing(scene.log, id, scene.now)
  const base = { isDashed: false, isFaded: false, isNudgeBooked: false }
  if (s.state === 'missing') return { ...base, big: '…', label: name, isDashed: true }
  // Never an assumed full window: the allowance may have been spent elsewhere.
  if (s.state === 'reset') return { ...base, big: 'Reset', label: `${name} · new window`, isDashed: true, tip: `${name} · reset at ${hhmm(s.reading.resetsAt)}, no Reading of the new window yet` }
  const { left, resetsAt, at, source } = s.reading
  const toReset = `resets in ${until(resetsAt - scene.now)}`
  return {
    ...base,
    fill: left,
    big: `${s.isStale ? '~' : ''}${pct(left)}`,
    label: `${name} · ${resetLabel(resetsAt, scene.now)}`,
    tip: s.isStale
      ? `${name} · ${pct(left)} left as of ${hhmm(at)} (${ago(scene.now - at)}, ${SOURCE_NAMES[source]}) · ${toReset}`
      : `${name} · ${pct(left)} left · ${toReset}`,
    isFaded: s.isStale,
  }
}

/** The line under the ring: how old the figures are and, when it matters, why. */
export function footnote(scene: Scene): { text: string; isAmber: boolean } {
  const { endpoint, now } = scene
  const states = (['five_hour', 'seven_day'] as const).map(id => [id, standing(scene.log, id, now)] as const)
  const isEndpointDown = endpoint.state === 'off' || endpoint.state === 'backoff'
  if (states.every(([, s]) => s.state === 'missing'))
    return { text: isEndpointDown ? 'No reading yet: send a message' : 'Checking usage…', isAmber: false }

  const ages = states.flatMap(([, s]) => (s.state === 'read' ? [now - s.reading.at] : []))
  const age = ages.length ? Math.max(...ages) : Math.min(...states.flatMap(([, s]) => (s.state === 'reset' ? [now - s.reading.at] : [])))
  const parts = [`Updated ${ago(age)}`]
  if (endpoint.state === 'backoff') parts.push(`Usage API busy (${endpoint.status}), retrying at ${hhmm(endpoint.until)}`)
  else if (endpoint.state === 'off') parts.push(endpoint.why === 'refused' ? 'session data only' : 'usage API unreadable · session data only')
  for (const [id, s] of states) {
    if (s.state === 'reset') parts.push(`${WINDOWS[id].name} reset, waiting for a Reading`)
    if (s.state === 'missing') parts.push(`no ${WINDOWS[id].name.toLowerCase()} Reading yet`)
  }
  const isStale = states.some(([, s]) => s.state === 'read' && s.isStale)
  if (isStale && parts.length === 1) parts.push('no newer Reading')
  return { text: parts.join(' · '), isAmber: isStale || states.some(([, s]) => s.state === 'reset') }
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

  const foot = footnote(scene)
  // Only the endpoint reports model-specific windows: with it off, their figures can't be kept current.
  const models = scene.endpoint.state === 'off' ? [] : modelLines(scene.log, scene.now)
  return (
    <Box flexDirection="column" alignItems="center" gap={1}>
      {ring}
      {models.length > 0 && (
        <Box flexDirection="column">
          {models.map(m => <Text size="footnote" dimColor={m.isStale}>{m.text}</Text>)}
        </Box>
      )}
      {speedometer($, e, scene)}
      <Text size="footnote" color={foot.isAmber ? AMBER : undefined} dimColor={!foot.isAmber}>{foot.text}</Text>
    </Box>
  )
}

const NO_BURN = ['Burn Rate after', '1 h of Active Use']

/** The 5-hour Burn Rate speedometer. */
function speedometer($: EngineInterface, e: RenderInput<'Pane'>, scene: Scene) {
  const { Box, Text } = $.ui.resolve(e)
  const p = paceOf(scene, 'five_hour')
  const hasBurn = activity(scene.log, scene.slots, scene.now) !== undefined
  const note = hasBurn ? ['Waiting for a', '5-hour Reading'] : NO_BURN
  if (e.surface === 'terminal') {
    if (!p) return <Text dimColor>{note.join(' ')}</Text>
    return (
      <Box flexDirection="column">
        <Text>
          Burn Rate <Text bold>{`${rate(p.rate)}${p.unit}`}</Text> · <Text color={CALL_COLOR(p, WARM)} bold>{CALL_WORDS[p.call]}</Text> <Text dimColor>{CALL_HINTS[p.call]}</Text>
        </Text>
        <Text dimColor>{p.why}</Text>
      </Box>
    )
  }
  const [source, height] = gaugeSvg(200, '5-hour', WARM, p, note)
  const alt = p ? `5-hour Burn Rate ${rate(p.rate)}${p.unit}: ${CALL_WORDS[p.call]}, ${CALL_HINTS[p.call]}. ${p.why}` : `5-hour: ${note.join(' ')}`
  return svg($, e, source, alt, 200, height)
}

/** An Svg where the surface draws one; the terminal gets the same figures as text instead. */
function svg($: EngineInterface, e: RenderInput<'Pane' | 'AbovePrompt'>, source: string, alt: string, width: number, height: number) {
  if (e.surface === 'terminal') return null
  const { Svg } = $.ui.resolve(e)
  return <Svg isInteractive source={source} alt={alt} width={width} height={height} />
}

export const mainWindows = Object.keys(WINDOWS) as WindowId[]
