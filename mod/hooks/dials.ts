// The Pane's car-style dials, all one size: per Usage Window a fuel gauge
// (Unused Allowance on the 240° scale from E to F, the time left to the Reset
// draining on the 120° below it, a clock counting down in the centre) and a
// Burn Rate speedometer. Two looks: `fuel` keeps the split ring's thick arcs,
// `needle` is thin scales with ticks, a needle and an LCD window.
import { PACE_CALL_HINTS, PACE_CALL_WORDS, type Pace } from './figures'
import { niceMax, paceCallColor } from './gauge'
import { AMBER, EASE, MUTED, TRACK, esc, font, gradient, type Pair } from './look'
import type { Half } from './ring'
import { countdown, rate as rateText } from './time'

export type Look = 'fuel' | 'needle'

/** One window's fuel gauge. */
export type Fuel = {
  name: string
  colors: Pair
  windowMs: number
  half: Half
  /** Time to the Reset, while there is a Reading of the current window. */
  toReset?: number
}

const RED = EASE

/**
 * Where a rate sits on a speedometer's sweep, 0 to 1: Use more, On track and
 * Ease off each take a third, however wide each is in %/h.
 */
function sweep(p: Pace, max: number, v: number) {
  if (v <= p.r1) return p.r1 > 0 ? Math.max(0, v) / p.r1 / 3 : 1 / 3
  if (v <= p.r2) return (1 + (v - p.r1) / Math.max(1e-9, p.r2 - p.r1)) / 3
  return Math.min(1, (2 + (v - p.r2) / Math.max(1e-9, max - p.r2)) / 3)
}
const MONO = 'font-family="ui-monospace,SFMono-Regular,Menlo,monospace"'

const f = (n: number) => n.toFixed(1)
const clamp = (n: number) => Math.min(1, Math.max(0, n))
const pol = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}
const arcD = (cx: number, cy: number, r: number, a: number, b: number) => {
  const [x1, y1] = pol(cx, cy, r, a)
  const [x2, y2] = pol(cx, cy, r, b)
  return `M ${f(x1)} ${f(y1)} A ${f(r)} ${f(r)} 0 ${b - a > 180 ? 1 : 0} 1 ${f(x2)} ${f(y2)}`
}
const stroke = (d: string, color: string, w: number, cap = 'round', extra = '') =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${f(w)}" stroke-linecap="${cap}"${extra}/>`
const line = (a: [number, number], b: [number, number], color: string, w: number) =>
  `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${color}" stroke-width="${f(w)}" stroke-linecap="round"/>`
const text = (x: number, y: number, px: number, fill: string, body: string, extra = '', family = font) =>
  `<text x="${f(x)}" y="${f(y)}" text-anchor="middle" dominant-baseline="central" ${family} font-size="${f(px)}" fill="${fill}"${extra}>${body}</text>`
const svg = (S: number, body: string, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><defs>${defs}</defs>${body}</svg>`
/** The fuel pump, from a 24-unit box. */
const pump = (x: number, y: number, s: number, fill: string) =>
  `<g transform="translate(${f(x - s / 2)} ${f(y - s / 2)}) scale(${(s / 24).toFixed(3)})" fill="${fill}">` +
  `<path fill-rule="evenodd" d="M4 3h9a1 1 0 0 1 1 1v17H3V4a1 1 0 0 1 1-1zm1.5 2v5h6V5z"/>` +
  `<path d="M14 9h2a2 2 0 0 1 2 2v6a1 1 0 0 0 2 0V8.4l-3-3 1.1-1.1 3.4 3.4V17a3 3 0 0 1-6 0v-6h-1.5z"/></g>`
/** `● ` before a name when a Nudge is booked for the window. */
const dot = (h: Half) => (h.isNudgeBooked ? `<tspan fill="${AMBER}">● </tspan>` : '')
const titled = (tip: string | undefined, body: string, opacity = 1) =>
  `<g opacity="${opacity}">${tip ? `<title>${esc(tip)}</title>` : ''}${body}</g>`

/** The line under the clock, or in its place: `5-hour · resets in`, `5-hour · new window`. */
const caption = (d: Fuel) => `${dot(d.half)}${esc(d.toReset !== undefined ? `${d.name} · resets in` : d.half.label)}`

export function fuelSvg(look: Look, S: number, d: Fuel): string {
  return look === 'needle' ? fuelNeedle(S, d) : fuelRing(S, d)
}

export function speedSvg(look: Look, S: number, name: string, colors: Pair, p: Pace | undefined, note: readonly string[]): string {
  return look === 'needle' ? speedNeedle(S, name, colors, p, note) : speedRing(S, name, colors, p, note)
}

// ── fuel: the split ring's arcs with fuel-gauge ticks ───────────────────────

function fuelRing(S: number, d: Fuel) {
  const { half: h, colors } = d
  // Ids are page-wide where a surface inlines the Svgs: one per window.
  const id = `ai-pal-fuel-${d.windowMs > 86_400_000 ? 'weekly' : '5h'}`
  const sw = S * 0.085
  const c = S / 2
  const r = S / 2 - sw / 2 - 2
  // Degrees between the arcs past the round caps, as on the split ring.
  const gap = 9 + ((sw / r) * 180) / Math.PI
  const dash = h.isDashed ? ` stroke-dasharray="${f(sw * 0.35)} ${f(sw * 0.55)}"` : ''
  const cap = h.isDashed ? 'butt' : 'round'
  const seg = (from: number, to: number, frac: number | undefined, color: string, isFromEnd: boolean, opacity = 1) => {
    from += gap / 2
    to -= gap / 2
    const len = Math.max(1, (to - from) * clamp(frac ?? 0))
    const [a, b] = isFromEnd ? [to - len, to] : [from, from + len]
    return stroke(arcD(c, c, r, from, to), TRACK, sw, cap, dash) +
      (frac !== undefined && frac > 0 ? stroke(arcD(c, c, r, a, b), color, sw, 'round', opacity < 1 ? ` stroke-opacity="${opacity}"` : '') : '')
  }
  const from = 240 + gap / 2
  const to = 480 - gap / 2
  const inner = r - sw / 2 - 3
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(q => {
    const deg = from + (to - from) * q
    return line(pol(c, c, inner, deg), pol(c, c, inner - (q === 0.5 ? S * 0.05 : S * 0.03), deg), MUTED, q === 0.5 ? 1.6 : 1.1)
  }).join('')
  const ef = (q: number, t: string) => {
    const [x, y] = pol(c, c, inner - S * 0.07, from + (to - from) * q)
    return text(x, y, S * 0.06, MUTED, t, ' font-weight="650"')
  }
  // An hour mark (a day mark for the weekly window) on the time arc.
  const slots = Math.round(d.windowMs / (d.windowMs > 86_400_000 ? 86_400_000 : 3_600_000))
  const tf = 120 + gap / 2
  const tt = 240 - gap / 2
  const marks = Array.from({ length: slots - 1 }, (_, i) => {
    const deg = tt - ((tt - tf) * (i + 1)) / slots
    return line(pol(c, c, inner, deg), pol(c, c, inner - S * 0.022, deg), MUTED, 1)
  }).join('')
  const isWeek = d.windowMs > 86_400_000
  const timeFill = d.toReset === undefined ? undefined : d.toReset / d.windowMs
  return svg(S,
    titled(h.tip,
      seg(240, 480, h.fill === undefined ? undefined : h.fill / 100, `url(#${id})`, false) +
      seg(120, 240, timeFill, colors[1], true, 0.55) +
      ticks + marks + ef(0.05, 'E') + ef(0.95, 'F') +
      pump(c, c - S * 0.2, S * 0.075, MUTED) +
      text(c, c - S * 0.05, S * 0.15, h.isDashed ? MUTED : colors[1], esc(h.big), ' font-weight="650"') +
      (d.toReset !== undefined ? text(c, c + S * 0.1, S * (isWeek ? 0.062 : 0.085), colors[1], countdown(d.toReset), ' font-weight="600"', MONO) : '') +
      text(c, c + (d.toReset !== undefined ? S * 0.2 : S * 0.1), S * 0.055, MUTED, caption(d)),
      h.isFaded ? 0.4 : 1),
    gradient(id, colors))
}

function speedRing(S: number, name: string, colors: Pair, p: Pace | undefined, note: readonly string[]) {
  // The fuel gauge's radius and stroke, so the two dials are the same width.
  const sw = S * 0.085
  const c = S / 2
  const r = S / 2 - sw / 2 - 2
  const label = text(c, c + S * 0.33, S * 0.055, MUTED, esc(`${name} · Burn Rate`))
  if (!p) {
    return svg(S, titled(`${name} · ${note.join(' ')}`,
      stroke(arcD(c, c, r, -120, 120), TRACK, sw, 'butt') +
      text(c, c - S * 0.05, S * 0.12, MUTED, '—', ' font-weight="650"') +
      note.map((l, i) => text(c, c + S * (0.08 + 0.065 * i), S * 0.05, MUTED, esc(l))).join('') + label))
  }
  const max = niceMax(Math.max(p.r2 * 1.5, p.rate * 1.15))
  const ang = (v: number) => -120 + 240 * sweep(p, max, v)
  const zone = (a: number, b: number, color: string) => (b > a ? stroke(arcD(c, c, r, ang(a), ang(b)), color, sw, 'butt', ' stroke-opacity="0.92"') : '')
  // The zone edges, labelled just inside the scale.
  const edge = (v: number) => {
    const [x, y] = pol(c, c, r - sw / 2 - S * 0.06, ang(v))
    return text(x, y, S * 0.048, MUTED, rateText(v))
  }
  const a = ang(p.rate)
  const tip = pol(c, c, r + sw / 2 + 1, a)
  const base = pol(c, c, r - sw / 2 - S * 0.04, a)
  return svg(S, titled(why(name, p),
    zone(0, p.r1, AMBER) + zone(p.r1, p.r2, colors[1]) + zone(p.r2, max, EASE) + edge(p.r1) + edge(p.r2) +
    line(base, tip, 'rgba(0,0,0,0.6)', S * 0.032) + line(base, tip, '#FFFFFF', S * 0.018) +
    text(c, c - S * 0.05, S * 0.13, colors[1], `${rateText(p.rate)}<tspan font-size="${f(S * 0.06)}" font-weight="500" fill="${MUTED}">${p.unit}</tspan>`, ' font-weight="650"') +
    text(c, c + S * 0.09, S * 0.072, paceCallColor(p, colors), esc(PACE_CALL_WORDS[p.paceCall]), ' font-weight="650"') +
    text(c, c + S * 0.16, S * 0.05, MUTED, esc(PACE_CALL_HINTS[p.paceCall])) + label))
}

const why = (name: string, p: Pace) =>
  `${name} · ${rateText(p.rate)}${p.unit} of Active Use · ${PACE_CALL_WORDS[p.paceCall]}: ${p.why}`

// ── needle: thin scales, ticks, a needle, an LCD window ─────────────────────

function needle(c: number, cy: number, S: number, deg: number, hub: string, reach: number) {
  const tip = pol(c, cy, reach, deg)
  const tail = pol(c, cy, S * 0.06, deg + 180)
  return line(tail, tip, 'rgba(0,0,0,0.6)', S * 0.03) + line(tail, tip, '#FFFFFF', S * 0.016) +
    `<circle cx="${f(c)}" cy="${f(cy)}" r="${f(S * 0.04)}" fill="${hub}" stroke="rgba(0,0,0,0.5)" stroke-width="1"/>`
}
const lcd = (c: number, cy: number, S: number, body: string) =>
  `<rect x="${f(c - S * 0.24)}" y="${f(cy + S * 0.15)}" width="${f(S * 0.48)}" height="${f(S * 0.11)}" rx="${f(S * 0.02)}" fill="rgba(142,142,142,0.14)" stroke="${TRACK}"/>` + body

function fuelNeedle(S: number, d: Fuel) {
  const { half: h, colors } = d
  const c = S / 2
  const cy = S * 0.5
  const r = S * 0.43
  const bw = S * 0.035
  const ang = (q: number) => -120 + 240 * clamp(q)
  const dash = h.isDashed ? ` stroke-dasharray="${f(bw)} ${f(bw)}"` : ''
  const ticks = Array.from({ length: 9 }, (_, i) => {
    const major = i % 4 === 0
    const deg = ang(i / 8)
    return line(pol(c, cy, r - bw / 2 - 2, deg), pol(c, cy, r - bw / 2 - 2 - (major ? S * 0.07 : S * 0.035), deg), MUTED, major ? 2 : 1.1)
  }).join('')
  const lab = (q: number, t: string) => {
    const [x, y] = pol(c, cy, r - S * 0.15, ang(q))
    return text(x, y, S * 0.07, MUTED, t, ' font-weight="650"')
  }
  const [px, py] = pol(c, cy, r - S * 0.16, ang(0.25))
  const isWeek = d.windowMs > 86_400_000
  const slots = Math.round(d.windowMs / (isWeek ? 86_400_000 : 3_600_000))
  const marks = Array.from({ length: slots - 1 }, (_, i) => {
    const deg = 240 - (120 * (i + 1)) / slots
    return line(pol(c, cy, r + bw / 2, deg), pol(c, cy, r - bw / 2, deg), 'rgba(0,0,0,0.35)', 1.2)
  }).join('')
  const t = d.toReset === undefined ? 0 : clamp(d.toReset / d.windowMs)
  const fill = h.fill === undefined ? undefined : h.fill / 100
  return svg(S, titled(h.tip,
    stroke(arcD(c, cy, r, -120, 120), TRACK, bw, 'butt', dash) +
    stroke(arcD(c, cy, r, -120, ang(0.125)), RED, bw, 'butt') +
    (fill ? stroke(arcD(c, cy, r, -120, ang(fill)), colors[1], bw * 0.45, 'butt', ' stroke-opacity="0.9"') : '') +
    ticks + lab(0, 'E') + lab(0.5, '½') + lab(1, 'F') +
    stroke(arcD(c, cy, r, 125, 235), TRACK, bw, 'butt', dash) +
    (t > 0 ? stroke(arcD(c, cy, r, 235 - 110 * t, 235), colors[0], bw, 'butt') : '') + marks +
    pump(px, py, S * 0.075, MUTED) +
    (fill !== undefined ? needle(c, cy, S, ang(fill), colors[1], r - S * 0.05) : '') +
    text(c, cy + S * 0.095, S * 0.08, h.isDashed ? MUTED : colors[1], esc(h.big), ' font-weight="700"') +
    // With a clock, the window's name under its LCD; without, `5-hour · new window` in the LCD's place.
    (d.toReset !== undefined
      ? lcd(c, cy, S, text(c, cy + S * 0.205, S * (isWeek ? 0.062 : 0.075), colors[1], countdown(d.toReset), ' font-weight="600"', MONO)) +
        text(c, cy + S * 0.3, S * 0.052, MUTED, `${dot(h)}${esc(d.name)}`)
      : text(c, cy + S * 0.205, S * 0.052, MUTED, caption(d))),
    h.isFaded ? 0.4 : 1))
}

function speedNeedle(S: number, name: string, colors: Pair, p: Pace | undefined, note: readonly string[]) {
  const c = S / 2
  const cy = S * 0.5
  const r = S * 0.43
  const bw = S * 0.035
  const label = text(c, cy + S * 0.3, S * 0.052, MUTED, esc(`${name} · Burn Rate`))
  if (!p) {
    return svg(S, titled(`${name} · ${note.join(' ')}`,
      stroke(arcD(c, cy, r, -120, 120), TRACK, bw, 'butt') +
      text(c, cy - S * 0.03, S * 0.1, MUTED, '—', ' font-weight="650"') +
      note.map((l, i) => text(c, cy + S * (0.09 + 0.065 * i), S * 0.05, MUTED, esc(l))).join('') + label))
  }
  const max = niceMax(Math.max(p.r2 * 1.5, p.rate * 1.15))
  const ang = (v: number) => -120 + 240 * sweep(p, max, v)
  const zone = (a: number, b: number, color: string) => (b > a ? stroke(arcD(c, cy, r, ang(a), ang(b)), color, bw, 'butt') : '')
  // A tick every 20°: majors at the ends and the zone edges, which are labelled.
  const ticks = Array.from({ length: 13 }, (_, i) => {
    const major = i % 4 === 0
    const deg = -120 + 20 * i
    const t = line(pol(c, cy, r - bw / 2 - 2, deg), pol(c, cy, r - bw / 2 - 2 - (major ? S * 0.07 : S * 0.035), deg), MUTED, major ? 2 : 1.1)
    if (i !== 4 && i !== 8) return t
    const [x, y] = pol(c, cy, r - S * 0.15, deg)
    return t + text(x, y, S * 0.055, MUTED, rateText(i === 4 ? p.r1 : p.r2))
  }).join('')
  return svg(S, titled(why(name, p),
    zone(0, p.r1, AMBER) + zone(p.r1, p.r2, colors[1]) + zone(p.r2, max, EASE) + ticks +
    needle(c, cy, S, ang(p.rate), colors[1], r - S * 0.05) +
    text(c, cy + S * 0.095, S * 0.07, paceCallColor(p, colors), esc(PACE_CALL_WORDS[p.paceCall]), ' font-weight="700"') +
    lcd(c, cy, S, text(c, cy + S * 0.205, S * 0.07, colors[1], `${rateText(p.rate)} ${p.unit}`, ' font-weight="600"', MONO)) +
    label))
}
