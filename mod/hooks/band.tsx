// The band above the prompt: a column per window (5-hour left, weekly
// right), each its Unused Allowance over a speed bar with the rate and the
// Pace Call. Under 1 h of Active Use the speed bar is a countdown to Reset.
import type { EngineInterface, RenderInput } from 'claude-code'
import { PACE_CALL_HINTS, PACE_CALL_WORDS, type Pace } from './figures'
import { paceCallColor, niceMax } from './gauge'
import { AMBER, GREY, MUTED, NUDGE, TRACK, esc, font, gradient } from './look'
import { half, isBooked, paceOf, type Scene } from './readout'
import { WINDOWS, type MainWindow } from './windows'
import { standing, type Standing } from './standing'
import { DAY, H, old, rate, resetLabel, until } from './time'

const BAR = 10
const ROW = 22
const COL_GAP = 28
/** The band reports its width in code-font cells only; ~7.2px a cell is a guess. */
const CELL_PX = 7.2

type Span = [text: string, fill: string, isBold?: boolean]
const width = (spans: Span[], fs = 12) => spans.reduce((a, s) => a + s[0].length, 0) * fs * 0.56
const tspans = (spans: Span[]) =>
  spans.map(([t, fill, b]) => `<tspan fill="${fill}"${b ? ' font-weight="650"' : ''}>${esc(t)}</tspan>`).join('')
const plain = (spans: Span[]) => spans.map(s => s[0]).join('')

/** One window's column, decided once for both surfaces. */
type Column = {
  id: MainWindow
  s: Standing
  top: Span[]
  bottom: Span[]
  tip?: string
  pace?: Pace
  /** Why, on hover of the speed bar, or the countdown's own tip. */
  bottomTip: string
  isNudgeBooked: boolean
}

function column(scene: Scene, id: MainWindow, isNudgeBooked: boolean): Column {
  const { name, colors } = WINDOWS[id]
  const s = standing(scene.log, id, scene.now)
  const dot: Span[] = isNudgeBooked ? [['● ', NUDGE]] : []
  if (s.state !== 'read') {
    const word = s.state === 'reset' ? 'Reset' : '…'
    return { id, s, top: [...dot, [`${name} `, MUTED], [word, MUTED, true]], bottom: [['', MUTED]], bottomTip: `${name} · ${word}`, isNudgeBooked }
  }
  const { left, resetsAt, at } = s.reading
  const p = paceOf(scene, id)
  const top: Span[] = [...dot, [`${name} `, MUTED], [`${s.isStale ? '~' : ''}${Math.round(left)}%`, colors[1], true], [` · ${resetLabel(resetsAt, scene.now)}`, MUTED]]
  if (s.isStale) top.push([` · ${old(scene.now - at)}`, AMBER])
  const bottom: Span[] = p
    ? [[`${rate(p.rate)}${p.unit}`, colors[1], true], [' · ', MUTED], [PACE_CALL_WORDS[p.paceCall], paceCallColor(p, colors), true]]
    : [['Burn Rate after 1 h', MUTED]]
  const bottomTip = p
    ? `${name} · ${rate(p.rate)}${p.unit} · ${PACE_CALL_WORDS[p.paceCall]}, ${PACE_CALL_HINTS[p.paceCall]}: ${p.why}`
    : `${name} · resets in ${until(resetsAt - scene.now)} · Burn Rate after 1 h of Active Use`
  return { id, s, top, bottom, tip: half(scene, id).tip, pace: p, bottomTip, isNudgeBooked }
}

function columnSvg(x: number, w: number, lw: number, c: Column, now: number): string {
  const { colors } = WINDOWS[c.id]
  const bx = x + lw
  const bw = Math.max(40, w - lw)
  const text = (y: number, spans: Span[]) => `<text x="${x}" y="${y}" dominant-baseline="central" ${font} font-size="12">${tspans(spans)}</text>`
  const y1 = ROW / 2
  const y2 = ROW + ROW / 2
  const dashed = (y: number) =>
    `<rect x="${bx + 0.5}" y="${y - BAR / 2 + 0.5}" width="${bw - 1}" height="${BAR - 1}" rx="${BAR / 2}" fill="none" stroke="${MUTED}" stroke-opacity="0.6" stroke-dasharray="3 3"/>`
  const g = (tip: string | undefined, body: string) => `<g>${tip ? `<title>${esc(tip)}</title>` : ''}${body}</g>`

  if (c.s.state !== 'read') return g(c.bottomTip, text(y1, c.top) + dashed(y1) + dashed(y2))

  const isStale = c.s.isStale
  const { left, resetsAt } = c.s.reading
  const fill = (bw * Math.min(100, Math.max(0, left))) / 100
  const grad = c.id === 'five_hour' ? 'b5' : 'b7'
  const allowance = g(c.tip,
    text(y1, c.top) +
    `<rect x="${bx}" y="${y1 - BAR / 2}" width="${bw}" height="${BAR}" rx="${BAR / 2}" fill="${TRACK}"/>` +
    (fill > 0 ? `<rect x="${bx}" y="${y1 - BAR / 2}" width="${Math.max(BAR, fill)}" height="${BAR}" rx="${BAR / 2}" fill="url(#${grad})"/>` : ''))

  const by = y2 - BAR / 2
  let bar: string
  if (!c.pace) {
    // A countdown to Reset over the window's full length.
    const lenMs = c.id === 'five_hour' ? 5 * H : 7 * DAY
    const tx = Math.max(BAR, (bw * Math.min(lenMs, resetsAt - now)) / lenMs)
    bar = `<rect x="${bx}" y="${by}" width="${bw}" height="${BAR}" rx="${BAR / 2}" fill="none" stroke="${TRACK}"/>` +
      `<rect x="${bx}" y="${by}" width="${tx.toFixed(1)}" height="${BAR}" rx="${BAR / 2}" fill="${TRACK}"/>`
  } else {
    const p = c.pace
    const max = niceMax(Math.max(p.r2 * 1.5, p.rate * 1.15))
    const X = (v: number) => bx + (bw * Math.min(max, Math.max(0, v))) / max
    const clip = `clip-${c.id}`
    bar = `<clipPath id="${clip}"><rect x="${bx}" y="${by}" width="${bw}" height="${BAR}" rx="${BAR / 2}"/></clipPath>` +
      `<g clip-path="url(#${clip})"><rect x="${bx}" y="${by}" width="${bw}" height="${BAR}" fill="${TRACK}"/>` +
      `<rect x="${bx}" y="${by}" width="${(X(p.r1) - bx).toFixed(1)}" height="${BAR}" fill="${AMBER}" fill-opacity="0.92"/>` +
      `<rect x="${X(p.r1).toFixed(1)}" y="${by}" width="${(X(p.r2) - X(p.r1)).toFixed(1)}" height="${BAR}" fill="${colors[1]}" fill-opacity="0.92"/></g>` +
      `<rect x="${(X(p.rate) - 2.5).toFixed(1)}" y="${by - 4}" width="5" height="${BAR + 8}" rx="2.5" fill="#FFFFFF" stroke="rgba(0,0,0,0.6)" stroke-width="1"/>`
  }
  return `<g opacity="${isStale ? 0.4 : 1}">${allowance}${g(c.bottomTip, text(y2, c.bottom) + bar)}</g>`
}

function bandSvg(W: number, cols: [Column, Column], now: number): string {
  const colW = (W - COL_GAP) / 2
  // One label width for both columns, so the four bars line up.
  const lw = Math.ceil(Math.max(...cols.flatMap(c => [width(c.top), width(c.bottom)]))) + 10
  const H2 = ROW * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H2}" viewBox="0 0 ${W} ${H2}">` +
    `<defs>${gradient('b5', WINDOWS.five_hour.colors)}${gradient('b7', WINDOWS.seven_day.colors)}</defs>` +
    columnSvg(0, colW, lw, cols[0], now) + columnSvg(colW + COL_GAP, colW, lw, cols[1], now) + `</svg>`
}

/** The terminal's line for one window. */
function line(c: Column): string {
  const head = plain(c.top)
  if (c.s.state !== 'read') return head
  if (!c.pace) return `${head} · Burn Rate after 1 h of Active Use`
  return `${head} · ${plain(c.bottom)} (${c.pace.why})`
}

/** The band, or undefined to leave the row to the engine (nothing stored). */
export function drawBand($: EngineInterface, e: RenderInput<'AbovePrompt'>, scene: Scene) {
  const cols: [Column, Column] = [column(scene, 'five_hour', isBooked(scene, 'five_hour')), column(scene, 'seven_day', isBooked(scene, 'seven_day'))]
  if (cols.every(c => c.s.state === 'missing')) return undefined
  const { Box, Text } = $.ui.resolve(e)
  const lines = cols.map(line)
  if (e.surface === 'terminal') {
    return (
      <Box flexDirection="column">
        {cols.map((c, i) => <Text dimColor={c.s.state === 'read' && c.s.isStale} color={c.s.state === 'read' ? undefined : GREY}>{lines[i]}</Text>)}
      </Box>
    )
  }
  const { Svg } = $.ui.resolve(e)
  const W = Math.max(360, Math.floor(e.props.bodyColumns * CELL_PX) - 4)
  return (
    <Box flexDirection="row">
      <Svg isInteractive source={bandSvg(W, cols, scene.now)} alt={lines.join(' · ')} width={W} height={ROW * 2} />
    </Box>
  )
}
