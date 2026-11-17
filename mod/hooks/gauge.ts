// The 5-hour Burn Rate speedometer: a 240° dial with three zones (amber =
// use more, warm = on track, grey = ease off), a white needle at the rate,
// and the rate and Pace Call in the centre.
import { PACE_CALL_HINTS, PACE_CALL_WORDS, type Pace } from './figures'
import { AMBER, GREY, MUTED, TRACK, esc, font, type Pair } from './look'
import { rate as rateText } from './time'

const SWEEP = 240
export const paceCallColor = (p: Pace, colors: Pair) => (p.paceCall === 'more' ? AMBER : p.paceCall === 'track' ? colors[1] : GREY)

export const niceMax = (v: number) => {
  const step = v <= 10 ? 2 : v <= 50 ? 10 : 20
  return Math.max(step, Math.ceil(v / step) * step)
}

/** The dial's markup and height; `pace` absent draws the empty dial with `note`. */
export function gaugeSvg(size: number, name: string, colors: Pair, pace: Pace | undefined, note: readonly string[]): [string, number] {
  const k = size / 200
  const sw = 13 * k
  const pad = 20 * k
  const r = size / 2 - sw / 2 - pad
  const cx = size / 2
  const cy = r + sw / 2 + pad
  const height = Math.ceil(cy + r * 0.5 + sw / 2 + 16 * k)
  const max = pace ? niceMax(Math.max(pace.r2 * 1.5, pace.rate * 1.15)) : 1
  const ang = (v: number) => -SWEEP / 2 + (SWEEP * Math.min(max, Math.max(0, v))) / max
  const pt = (deg: number, rad = r) => {
    const a = ((deg - 90) * Math.PI) / 180
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)] as const
  }
  const P = (deg: number, rad = r) => pt(deg, rad).map(n => n.toFixed(2)).join(' ')
  const arc = (a: number, b: number) => `M ${P(a)} A ${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${P(b)}`
  const txt = (x: number, y: number, size: number, fill: string, body: string, extra = '') =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="central" ${font} font-size="${(size * k).toFixed(1)}" fill="${fill}"${extra}>${body}</text>`

  if (!pace) {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 ${size} ${height}">` +
        `<g><title>${esc(`${name} · ${note.join(' ')}`)}</title>` +
        `<path d="${arc(-SWEEP / 2, SWEEP / 2)}" fill="none" stroke="${TRACK}" stroke-width="${sw}"/>` +
        txt(cx, cy - 8 * k, 24, MUTED, '—', ' font-weight="650"') +
        note.map((line, i) => txt(cx, cy + (14 + 14 * i) * k, 10.5, MUTED, esc(line))).join('') +
        `</g></svg>`,
      height,
    ]
  }

  const unit = pace.unit
  const k1 = rateText(pace.r1)
  const k2 = rateText(pace.r2)
  const zone = (from: number, to: number, stroke: string, tip: string, opacity = 1) =>
    to > from ? `<g><title>${esc(tip)}</title><path d="${arc(ang(from), ang(to))}" fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${sw}"/></g>` : ''
  const edge = (v: number, text: string) => {
    const a = ang(v)
    const [x, y] = pt(a, r + sw / 2 + 7 * k)
    const anchor = a < -10 ? 'end' : a > 10 ? 'start' : 'middle'
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="central" ${font} font-size="${(9.5 * k).toFixed(1)}" fill="${MUTED}">${esc(text)}</text>`
  }
  const why = `${name} · ${rateText(pace.rate)}${unit} of Active Use · ${PACE_CALL_WORDS[pace.paceCall]}: ${pace.why}`
  const a = ang(pace.rate)
  const [x1, y1] = pt(a, r - sw / 2 - 7 * k)
  const [x2, y2] = pt(a, r + sw / 2 + 1)
  const line = (stroke: string, w: number) =>
    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${(w * k).toFixed(1)}" stroke-linecap="round"/>`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 ${size} ${height}">` +
      `<rect width="${size}" height="${height}" fill="transparent"><title>${esc(why)}</title></rect>` +
      zone(0, pace.r1, AMBER, `Below ${k1}${unit}: some of the ${Math.round(pace.left)}% left goes unused`, 0.92) +
      zone(pace.r1, pace.r2, colors[1], `${k1}–${k2}${unit}: spends it in half to all of the Active Use you can expect before the Reset`, 0.92) +
      zone(pace.r2, max, TRACK, `Above ${k2}${unit}: runs out with time to spare`) +
      edge(pace.r1, k1) + edge(pace.r2, k2) +
      `<g><title>${esc(why)}</title>${line('rgba(0,0,0,0.6)', 6)}${line('#FFFFFF', 3.5)}` +
      `<circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="${(3.5 * k).toFixed(1)}" fill="#FFFFFF" stroke="rgba(0,0,0,0.6)" stroke-width="1"/></g>` +
      `<g><title>${esc(why)}</title>` +
      txt(cx, cy - 12 * k, 26, colors[1], `${rateText(pace.rate)}<tspan font-size="${(13 * k).toFixed(1)}" font-weight="500" fill="${MUTED}">${unit}</tspan>`, ' font-weight="650"') +
      txt(cx, cy + 14 * k, 14, paceCallColor(pace, colors), esc(PACE_CALL_WORDS[pace.paceCall]), ' font-weight="650"') +
      txt(cx, cy + 30 * k, 10.5, MUTED, esc(PACE_CALL_HINTS[pace.paceCall])) +
      `</g></svg>`,
    height,
  ]
}
