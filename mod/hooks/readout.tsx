// The Readout's Pane: by default a column of car-style dials (a fuel gauge and
// a Burn Rate speedometer per window, dials.ts), or the split ring and the
// 5-hour speedometer; then the model rows and the footnote. Also the figures
// it shares with the band (band.tsx).
import type { EngineInterface, RenderInput } from 'claude-code'
import type { EndpointState } from '../types'
import type { Booked } from './booker'
import type { Log } from './log'
import { AMBER, COOL, WARM } from './look'
import { WINDOWS, type MainWindow } from './windows'
import { modelLines } from './models'
import { activity, PACE_CALL_HINTS, PACE_CALL_WORDS, pace, type Pace } from './figures'
import { paceCallColor, gaugeSvg } from './gauge'
import { ringSvg, type Half } from './ring'
import { fuelSvg, speedSvg, type Look } from './dials'
import type { Gauges } from './settings'
import { standing } from './standing'
import { ago, countdown, hhmm, rate, resetLabel, until } from './time'


/** Everything one drawing reads. */
export type Scene = { log: Log; now: number; endpoint: EndpointState; slots: readonly number[]; booked: readonly Booked[] }

/** Whether a window has a Nudge booked: the amber dot before its label. */
export const isBooked = (scene: Scene, id: MainWindow) => scene.booked.some(b => b.windows.includes(id))

/** A main window's Pace Call, when there is a Burn Rate and a current figure to judge. */
export function paceOf(scene: Scene, id: MainWindow): Pace | undefined {
  const a = activity(scene.log, scene.slots, scene.now)
  const s = standing(scene.log, id, scene.now)
  if (!a || s.state !== 'read') return undefined
  return pace(id, s.reading.left, s.reading.resetsAt - scene.now, a)
}

/** The ring's size in px: wide enough that `● Weekly · Fri 01:00` clears the arcs. */
const RING = 210

export const pct = (n: number) => `${Math.round(n)}%`
const SOURCE_NAMES = { api: 'usage API', session: 'session data' } as const

export function half(scene: Scene, id: MainWindow): Half {
  const { name } = WINDOWS[id]
  const s = standing(scene.log, id, scene.now)
  const base = { isDashed: false, isFaded: false, isNudgeBooked: isBooked(scene, id) }
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

export function drawPane($: EngineInterface, e: RenderInput<'Pane'>, scene: Scene, gauges: Gauges) {
  const { Box, Text } = $.ui.resolve(e)
  if (gauges !== 'ring' && e.surface !== 'terminal') return drawDials($, e, scene, gauges)
  const five = half(scene, 'five_hour')
  const week = half(scene, 'seven_day')
  const alt = [five, week].map(x => `${x.big} ${x.label}`).join('; ')

  const ring = e.surface !== 'terminal'
    ? svg($, e, ringSvg(RING, five, week), alt, RING, RING)
    : (
      <Box flexDirection="column">
        {([[five, WARM], [week, COOL]] as const).map(([x, c]) => (
          <Text dimColor={x.isFaded}>
            <Text color={x.isDashed ? undefined : c[1]} bold>{x.big}</Text> {x.isNudgeBooked && <Text color={AMBER}>● </Text>}<Text dimColor>{x.label}</Text>
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
/**
 * A desktop Pane cell in px: measured, a docked Pane of 42 × 62 cells drew
 * 356 × 1004 px. The engine gives a Pane its size in cells alone.
 */
const CELL_W = 8
const CELL_H = 16
/** The smallest dial, where the figures still read; a shorter Pane scrolls. */
const MIN_DIAL = 120

/**
 * The dials' size in px: four of them, the gaps between the Pane's rows, its
 * text lines and a row to spare fill the Pane's height, capped by its width.
 */
function dialSize(e: RenderInput<'Pane'>, modelRows: number) {
  // Between the four dials, the model rows' Box when there is one, and the footnote.
  const gaps = modelRows ? 5 : 4
  const rows = e.props.scroll.bodyRows - gaps - (modelRows + 1) - 1
  return Math.max(MIN_DIAL, Math.min(e.props.bodyColumns * CELL_W, Math.floor((rows * CELL_H) / 4)))
}
const WINDOW_MS = { five_hour: 5 * 3_600_000, seven_day: 7 * 86_400_000 } as const

/** The default Pane: per window a fuel gauge and a speedometer, in one column. */
function drawDials($: EngineInterface, e: RenderInput<'Pane'>, scene: Scene, look: Look) {
  const { Box, Text } = $.ui.resolve(e)
  const hasBurn = activity(scene.log, scene.slots, scene.now) !== undefined
  const models = scene.endpoint.state === 'off' ? [] : modelLines(scene.log, scene.now)
  const DIAL = dialSize(e, models.length)
  const dials = (['five_hour', 'seven_day'] as const).flatMap(id => {
    const { name, colors } = { ...WINDOWS[id], colors: id === 'five_hour' ? WARM : COOL }
    const h = half(scene, id)
    const s = standing(scene.log, id, scene.now)
    const toReset = s.state === 'read' ? s.reading.resetsAt - scene.now : undefined
    const fuelAlt = `${h.big} ${h.label}${toReset !== undefined ? `, resets in ${countdown(toReset)}` : ''}`
    const p = paceOf(scene, id)
    const note = hasBurn ? ['Waiting for a', `${name} Reading`] : NO_BURN
    const speedAlt = p
      ? `${name} Burn Rate ${rate(p.rate)}${p.unit}: ${PACE_CALL_WORDS[p.paceCall]}, ${PACE_CALL_HINTS[p.paceCall]}. ${p.why}`
      : `${name}: ${note.join(' ')}`
    return [
      // Images, not interactive frames: the Pane redraws every second for the
      // clocks, and a frame reloads (blanks) on each redraw where an image swaps.
      // The band's tooltip keeps the reason behind each Pace Call.
      svg($, e, fuelSvg(look, DIAL, { name, colors, windowMs: WINDOW_MS[id], half: h, toReset }), fuelAlt, DIAL, DIAL, false),
      svg($, e, speedSvg(look, DIAL, name, colors, p, note), speedAlt, DIAL, DIAL, false),
    ]
  })
  const foot = footnote(scene)
  return (
    <Box flexDirection="column" alignItems="center" gap={1}>
      {dials}
      {models.length > 0 && (
        <Box flexDirection="column">
          {models.map(m => <Text size="footnote" dimColor={m.isStale}>{m.text}</Text>)}
        </Box>
      )}
      <Text size="footnote" color={foot.isAmber ? AMBER : undefined} dimColor={!foot.isAmber}>{foot.text}</Text>
    </Box>
  )
}

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
          Burn Rate <Text bold>{`${rate(p.rate)}${p.unit}`}</Text> · <Text color={paceCallColor(p, WARM)} bold>{PACE_CALL_WORDS[p.paceCall]}</Text> <Text dimColor>{PACE_CALL_HINTS[p.paceCall]}</Text>
        </Text>
        <Text dimColor>{p.why}</Text>
      </Box>
    )
  }
  const [source, height] = gaugeSvg(200, '5-hour', WARM, p, note)
  const alt = p ? `5-hour Burn Rate ${rate(p.rate)}${p.unit}: ${PACE_CALL_WORDS[p.paceCall]}, ${PACE_CALL_HINTS[p.paceCall]}. ${p.why}` : `5-hour: ${note.join(' ')}`
  return svg($, e, source, alt, 200, height)
}

/** An Svg where the surface draws one; the terminal gets the same figures as text instead. */
function svg($: EngineInterface, e: RenderInput<'Pane'>, source: string, alt: string, width: number, height: number, isInteractive = true) {
  if (e.surface === 'terminal') return null
  const { Svg } = $.ui.resolve(e)
  return <Svg isInteractive={isInteractive} source={source} alt={alt} width={width} height={height} />
}

