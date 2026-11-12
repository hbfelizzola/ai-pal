// PROTOTYPE, throw away. Answers "Should the band above the prompt show the
// 5-hour time bar?" (hbfelizzola/ai-pal#17): five band layouts above the
// prompt, switched from the pane (◀ ▶), with the history pane that won "How
// do the history and Burn Rate sections look under the ring?" (#14) below the
// band controls. Mock data only; nothing here reads real usage.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Reading } from '../types'

const PANE = 'ai-pal'
const band = atom({ plugin: 'ai-pal-readout-prototype', key: 'band' } as const, 0)
const isBandOn = atom({ plugin: 'ai-pal-readout-prototype', key: 'isBandOn' } as const, true)
const isStale = atom({ plugin: 'ai-pal-readout-prototype', key: 'isStale' } as const, false)
const isCountdown = atom({ plugin: 'ai-pal-readout-prototype', key: 'isCountdown' } as const, false)
const scenario = atom({ plugin: 'ai-pal-readout-prototype', key: 'scenario' } as const, 0)
const shownFive = atom({ plugin: 'ai-pal-readout-prototype', key: 'shownFive' } as const, 5)
const shownWeek = atom({ plugin: 'ai-pal-readout-prototype', key: 'shownWeek' } as const, 5)
const tick = atom({ plugin: 'ai-pal-readout-prototype', key: 'tick' } as const, 0)

const BANDS = ['Beside', 'Whole band', 'Two rows', 'Two time bars', 'Time bar only']
const BAND_NOTES = [
  '5-hour time bar left, weekly Unused Allowance bar right',
  '5-hour time bar across the band, weekly as a text chip',
  "#6's two bars, the 5-hour time bar under them",
  '5-hour and weekly time bars side by side',
  'the 5-hour time bar alone; weekly lives in the pane',
]
const H = 3_600_000
const STALE_MIN = 42

// Window identities from #6: warm 5-hour, cool weekly. Fixed hex for both themes.
const WARM: [string, string] = ['#F6A15B', '#E0703F']
const COOL: [string, string] = ['#9A9AF7', '#5E5ED8']
const NUDGE = '#E5A50A'
const OVER = '#E5A50A'
const MUTED = '#8E8E8E'
const TRACK = 'rgba(142,142,142,0.28)'
const CELL_PX = 7.2
const FONT = 'font-family="-apple-system,system-ui,sans-serif"'
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const grad = (id: string, c: [string, string], vertical = false) =>
  `<linearGradient id="${id}" x1="0" y1="${vertical ? 1 : 0}" x2="${vertical ? 0 : 1}" y2="0"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient>`
const HATCH = '<pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" fill="rgba(255,255,255,0.35)"/></pattern>'

// ---------- mock history ----------

// One past Usage Window. lost undefined = no Reading in the window ("no data").
// isUpper: last Reading was > 15 min before the Reset, so the figure is "≤ X%".
// agoH: hours between its Reset and now.
type Past = { lost?: number; isUpper?: boolean; isEarly?: boolean; agoH: number }
type Kind = 'five_hour' | 'seven_day'
type Scenario = {
  name: string
  now: { five: [used: number, resetsInH: number]; week: [used: number, resetsInH: number] }
  five: Past[] // oldest first
  week: Past[]
  activeH: number // Active Use in the rolling 7 days
  burn: { five: number; week: number } // %/h of each cap
}

const spread = (vals: (number | string | null)[], spanH: number): Past[] =>
  vals.map((v, i) => {
    const agoH = Math.round(spanH - (spanH * i) / Math.max(1, vals.length - 1)) + 1
    if (v === null) return { agoH }
    if (typeof v === 'string') {
      const n = Number(v.slice(1))
      return v[0] === '≤' ? { lost: n, isUpper: true, agoH } : { lost: n, isEarly: true, agoH }
    }
    return { lost: v, agoH }
  })

const SCENARIOS: Scenario[] = [
  {
    name: 'Typical week',
    now: { five: [38, 2], week: [45, 75] },
    // '≤35' = upper bound, '↺41' = reset early, null = no data
    five: spread([8, 0, 22, '≤35', 4, null, 15, 0, '↺41', 3, 12, 0], 160),
    week: [{ lost: 18, agoH: 75 + 504 }, { lost: 30, isUpper: true, agoH: 75 + 336 }, { lost: 9, agoH: 75 + 168 }, { lost: 26, agoH: 75 }],
    activeH: 21,
    burn: { five: 18, week: 2.1 },
  },
  {
    name: 'Quiet week',
    now: { five: [5, 4.67], week: [12, 120] },
    five: spread([64, null], 130),
    week: [{ lost: 80, isUpper: true, agoH: 48 + 504 }, { lost: 72, agoH: 48 + 336 }, { agoH: 48 + 168 }, { lost: 55, agoH: 48 }],
    activeH: 0.6,
    burn: { five: 0, week: 0 },
  },
  {
    name: 'First days',
    now: { five: [30, 3], week: [8, 144] },
    five: spread([null], 20),
    week: [],
    activeH: 1.4,
    burn: { five: 22, week: 3 },
  },
  {
    name: 'Heavy user',
    now: { five: [80, 3], week: [70, 20] },
    five: spread([0, 2, 0, 5, 0, 0, 1, 9, 0, 3, 0, 0, 4, 0, 2, 0, 0, 1, 6, 0], 165),
    week: [{ lost: 0, agoH: 20 + 504 }, { lost: 2, agoH: 20 + 336 }, { lost: 0, agoH: 20 + 168 }, { lost: 1, agoH: 20 }],
    activeH: 38,
    burn: { five: 31, week: 4.8 },
  },
]

// ---------- derived figures (from #13's resolution) ----------

type Stats = {
  kind: Kind
  name: string
  colors: [string, string]
  past: Past[]
  avg?: number
  exact: number
  left: number
  resetMs: number
  burn?: number // undefined until ≥ 1 h of Active Use
  needH?: number
  isOver: boolean
}

function stats(s: Scenario, kind: Kind): Stats {
  const past = kind === 'five_hour' ? s.five : s.week
  const [used, inH] = kind === 'five_hour' ? s.now.five : s.now.week
  const exacts = past.filter(p => p.lost !== undefined && !p.isUpper)
  const avg = exacts.length ? Math.round(exacts.reduce((a, p) => a + (p.lost ?? 0), 0) / exacts.length) : undefined
  const left = 100 - used
  const burn = s.activeH >= 1 ? (kind === 'five_hour' ? s.burn.five : s.burn.week) : undefined
  const needH = burn ? left / burn : undefined
  const resetMs = inH * H
  return {
    kind, name: kind === 'five_hour' ? '5-hour' : 'Weekly', colors: kind === 'five_hour' ? WARM : COOL,
    past, avg, exact: exacts.length, left, resetMs, burn, needH,
    isOver: needH !== undefined && needH * H > resetMs,
  }
}

function untilText(ms: number): string {
  if (ms <= 0) return 'resetting'
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}
const hText = (h: number) => (h < 10 ? h.toFixed(1) : String(Math.round(h)))
const rateText = (r: number) => (r < 10 ? r.toFixed(1) : String(Math.round(r)))
const avgText = (st: Stats) =>
  st.past.length === 0 ? 'no past windows yet'
  : st.avg === undefined ? `no exact figure · 0 of ${st.past.length}`
  : `avg ${st.avg}% lost · ${st.exact} of ${st.past.length} windows`
const projText = (st: Stats) => `~${hText(st.needH ?? 0)} h needed · resets in ${untilText(st.resetMs)}`
const shortText = (st: Stats) => `short ~${hText((st.needH ?? 0) - st.resetMs / H)} h`
const entryText = (p: Past) =>
  p.lost === undefined ? '–' : p.isUpper ? `≤${p.lost}` : p.isEarly ? `${p.lost}↺` : String(p.lost)

function clock(now: number, agoH: number) {
  const d = new Date(now - agoH * H)
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  return `${day} ${String(d.getHours()).padStart(2, '0')}:00`
}
function pastTip(st: Stats, p: Past, now: number) {
  const at = `${st.name} · reset ${clock(now, p.agoH)}`
  if (p.lost === undefined) return `${at} · no data (no Reading in the window)`
  if (p.isUpper) return `${at} · ≤ ${p.lost}% lost (last Reading > 15 min before the Reset)`
  return `${at} · ${p.lost}% lost${p.isEarly ? ' · reset early' : ''}`
}

// ---------- drawings ----------

// Time bar: grey track = time to Reset, window-coloured fill = Active Use
// needed to spend what's left. Past the Reset tick, the overrun is amber.
function timeBarSvg(w: number, st: Stats): string {
  const h = 28
  const leftH = st.resetMs / H
  const need = st.needH ?? 0
  const scale = (w - 2) / (Math.max(leftH, need) * 1.04)
  const tx = leftH * scale
  const id = `t${st.kind}`
  const fill = Math.min(need, leftH) * scale
  const over = need > leftH
    ? `<rect x="${tx}" y="11" width="${(need - leftH) * scale}" height="11" fill="${OVER}" opacity="0.85"/><rect x="${tx}" y="11" width="${(need - leftH) * scale}" height="11" fill="url(#hatch)"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${grad(id, st.colors)}<pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" fill="rgba(255,255,255,0.35)"/></pattern></defs>` +
    `<g><title>${esc(`${st.name} · ${projText(st)}`)}</title>` +
    `<rect x="0" y="11" width="${tx}" height="11" rx="5.5" fill="${TRACK}"/>` +
    `<rect x="0" y="11" width="${Math.max(8, fill)}" height="11" rx="5.5" fill="url(#${id})"/>${over}` +
    `<line x1="${tx}" y1="7" x2="${tx}" y2="26" stroke="${MUTED}" stroke-width="1.2"/>` +
    `<text x="${Math.min(tx, w - 2)}" y="6" text-anchor="${tx > w - 40 ? 'end' : 'middle'}" ${FONT} font-size="9" fill="${MUTED}">Reset</text></g></svg>`
}

// One row per past period, newest first: when it reset, a bar of the cap with
// the Lost Allowance filled in the window's colour, and the figure. Upper
// bound: dashed outline. No data: empty track. Reset early: ↺ after the figure.
const ROW_H = 22
function periodRowsSvg(w: number, st: Stats, rows: Past[], now: number): string {
  const labelW = 70, figW = 78
  const bw = w - labelW - figW
  const id = `r${st.kind}`
  const color = st.colors[1]
  const when = (p: Past) => {
    const d = new Date(now - p.agoH * H)
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
    return st.kind === 'five_hour'
      ? `${day} ${String(d.getHours()).padStart(2, '0')}:00`
      : `${day} ${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`
  }
  const out = rows.map((p, i) => {
    const y = i * ROW_H
    const cy = y + ROW_H / 2
    const len = p.lost === undefined ? 0 : Math.max(4, (bw * p.lost) / 100)
    const bar = p.lost === undefined ? ''
      : p.isUpper
        ? `<rect x="${labelW + 0.5}" y="${cy - 5}" width="${len - 1}" height="10" rx="5" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-dasharray="2 2"/>`
        : `<rect x="${labelW}" y="${cy - 5.5}" width="${len}" height="11" rx="5.5" fill="url(#${id})"/>`
    const fig = p.lost === undefined ? 'no data' : `${p.isUpper ? '≤ ' : ''}${p.lost}% lost${p.isEarly ? ' ↺' : ''}`
    return `<g><title>${esc(pastTip(st, p, now))}</title><rect x="0" y="${y}" width="${w}" height="${ROW_H}" fill="transparent"/>` +
      `<text x="0" y="${cy}" dominant-baseline="central" ${FONT} font-size="10.5" fill="${MUTED}">${esc(when(p))}</text>` +
      `<rect x="${labelW}" y="${cy - 5.5}" width="${bw}" height="11" rx="5.5" fill="${TRACK}"/>${bar}` +
      `<text x="${w}" y="${cy}" text-anchor="end" dominant-baseline="central" ${FONT} font-size="10.5" fill="${p.lost === undefined ? MUTED : color}" ${p.lost === undefined ? '' : 'font-weight="600"'}>${esc(fig)}</text></g>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${rows.length * ROW_H}" viewBox="0 0 ${w} ${rows.length * ROW_H}"><defs>${grad(id, st.colors)}</defs>${out.join('')}</svg>`
}

// The winning ring from #6, unchanged.
type Win = { pct: number; tip: string; when: string; isDue: boolean }
function splitRingSvg(size: number, five?: Win, week?: Win): string {
  const sw = size * 0.09
  const m = size / 2
  const r = (size - sw) / 2 - 1
  // Degrees between the arcs, measured past the round caps (which reach
  // sw/2 beyond each end), so the visible gap at 10 and 2 o'clock stays ~9°.
  const gap = 9 + ((sw / r) * 180) / Math.PI
  const pt = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return `${(m + r * Math.cos(a)).toFixed(2)} ${(m + r * Math.sin(a)).toFixed(2)}`
  }
  const arc = (from: number, to: number) => `M ${pt(from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${pt(to)}`
  const seg = (from: number, to: number, w: Win | undefined, fill: string, isFromEnd = false) => {
    from += gap / 2
    to -= gap / 2
    const len = w ? ((to - from) * Math.min(100, w.pct)) / 100 : 0
    const a = isFromEnd ? to - Math.max(1, len) : from
    const end = isFromEnd ? to : from + Math.max(1, len)
    return `<g>${w ? `<title>${esc(w.tip)}</title>` : ''}<path d="${arc(from, to)}" fill="none" stroke="${TRACK}" stroke-width="${sw}" stroke-linecap="round"/>${
      w && w.pct > 0 ? `<path d="${arc(a, end)}" fill="none" stroke="${fill}" stroke-width="${sw}" stroke-linecap="round"/>` : ''
    }<path d="${arc(from, to)}" fill="none" stroke="transparent" stroke-width="${sw * 2.5}"/></g>`
  }
  const k = size / 180
  const block = (w: Win | undefined, name: string, color: string, y: number) =>
    w
      ? `<text x="${m}" y="${y}" text-anchor="middle" dominant-baseline="central" ${FONT} font-weight="650" font-size="${30 * k}" fill="${color}">${w.pct}%</text>` +
        `<text x="${m}" y="${y + 22 * k}" text-anchor="middle" dominant-baseline="central" ${FONT} font-size="${11 * k}" fill="${MUTED}">${
          w.isDue ? `<tspan fill="${NUDGE}">&#9679; </tspan>` : ''
        }${esc(name)} &#183; ${esc(w.when)}</text>`
      : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs>${grad('g5', WARM)}${grad('g7', [COOL[1], COOL[0]])}</defs>${seg(300, 420, five, 'url(#g5)')}${seg(60, 300, week, 'url(#g7)', true)}${block(five, '5-hour', WARM[1], m - 36 * k)}<line x1="${m - 26 * k}" y1="${m}" x2="${m + 26 * k}" y2="${m}" stroke="${TRACK}" stroke-width="1"/>${block(week, 'Weekly', COOL[1], m + 24 * k)}</svg>`
}

function ringWins(s: Scenario, now: number): [Win, Win] {
  const five = stats(s, 'five_hour')
  const week = stats(s, 'seven_day')
  const day = (ms: number) => {
    const d = new Date(now + ms)
    return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:00`
  }
  return [
    { pct: five.left, when: untilText(five.resetMs), isDue: false, tip: `5-hour · ${five.left}% left · resets in ${untilText(five.resetMs)}` },
    { pct: week.left, when: week.resetMs < 24 * H ? untilText(week.resetMs) : day(week.resetMs), isDue: false, tip: `Weekly · ${week.left}% left · resets in ${untilText(week.resetMs)}` },
  ]
}

// ---------- the band ----------

// One lane: a label row (name and figures) over an 8px bar. Lanes sit side by
// side or stacked; the band is one SVG so its width is ours to lay out.
const BAR = 8
const LANE_H = 30
const GAP = 24
const AGE_W = 84
type BandOpts = { isStale: boolean; isCountdown: boolean }
type Span = [text: string, fill: string, isBold?: boolean]
const tw = (spans: Span[], fs = 12) => spans.reduce((a, s) => a + s[0].length, 0) * fs * 0.56
const tspans = (spans: Span[]) =>
  spans.map(([t, fill, b]) => `<tspan fill="${fill}"${b ? ' font-weight="650"' : ''}>${esc(t)}</tspan>`).join('')
// The first right-hand label that fits beside the left one, else none.
const fit = (w: number, left: Span[], rights: Span[][]) => rights.find(r => tw(left) + tw(r) + 12 <= w) ?? []

function labelRow(x: number, y: number, w: number, left: Span[], rights: Span[][]) {
  const right = fit(w, left, rights)
  return `<text x="${x}" y="${y + 9}" dominant-baseline="central" ${FONT} font-size="12">${tspans(left)}</text>` +
    (right.length ? `<text x="${x + w}" y="${y + 9}" text-anchor="end" dominant-baseline="central" ${FONT} font-size="12">${tspans(right)}</text>` : '')
}

const gid = (st: Stats) => (st.kind === 'five_hour' ? 'b5' : 'b7')
const pctText = (st: Stats, o: BandOpts) => `${o.isStale ? '~' : ''}${st.left}%`

// #6's band bar: Unused Allowance left of the cap.
function pctLane(x: number, y: number, w: number, st: Stats, win: Win, o: BandOpts): string {
  const fill = (w * Math.min(100, st.left)) / 100
  return `<g><title>${esc(win.tip)}</title>` +
    labelRow(x, y, w, [[st.name, MUTED]], [[[pctText(st, o), st.colors[1], true], [` · ${win.when}`, MUTED]]]) +
    `<rect x="${x}" y="${y + 19}" width="${w}" height="${BAR}" rx="4" fill="${TRACK}"/>` +
    (fill > 0 ? `<rect x="${x}" y="${y + 19}" width="${Math.max(8, fill)}" height="${BAR}" rx="4" fill="url(#${gid(st)})"/>` : '') +
    `</g>`
}

// Before a Burn Rate (< 1 h of Active Use): the % bar, or a countdown of the
// time to Reset against the window's full length.
function noBurnLane(x: number, y: number, w: number, st: Stats, win: Win, o: BandOpts, isNameless = false): string {
  const left: Span[] = isNameless ? [] : [[`${st.name} `, MUTED], [pctText(st, o), st.colors[1], true], [` · ${win.when}`, MUTED]]
  const notes: Span[][] = [[['Burn Rate after 1 h of Active Use', MUTED]], [['Burn Rate after 1 h', MUTED]]]
  const by = y + 19
  let bar: string
  if (o.isCountdown) {
    const lenH = st.kind === 'five_hour' ? 5 : 168
    const tx = Math.max(8, (w * Math.min(lenH, st.resetMs / H)) / lenH)
    bar = `<rect x="${x + 0.5}" y="${by + 0.5}" width="${w - 1}" height="${BAR - 1}" rx="3.5" fill="none" stroke="${TRACK}" stroke-dasharray="2 2"/>` +
      `<rect x="${x}" y="${by}" width="${tx}" height="${BAR}" rx="4" fill="${TRACK}"/>` +
      `<line x1="${x + tx}" y1="${by - 3}" x2="${x + tx}" y2="${by + BAR + 3}" stroke="${MUTED}" stroke-width="1.2"/>`
  } else {
    const fill = (w * Math.min(100, st.left)) / 100
    bar = `<rect x="${x}" y="${by}" width="${w}" height="${BAR}" rx="4" fill="${TRACK}"/>` +
      (fill > 0 ? `<rect x="${x}" y="${by}" width="${Math.max(8, fill)}" height="${BAR}" rx="4" fill="url(#${gid(st)})"/>` : '')
  }
  return `<g><title>${esc(`${win.tip} · Burn Rate after 1 h of Active Use`)}</title>${labelRow(x, y, w, left, notes)}${bar}</g>`
}

// The time bar at band height: grey track = time to Reset, window gradient =
// Active Use needed, amber hatching past the Reset tick when it won't fit.
function timeLane(x: number, y: number, w: number, st: Stats, win: Win, o: BandOpts, isNameless = false): string {
  if (st.burn === undefined) return noBurnLane(x, y, w, st, win, o, isNameless)
  const need = st.needH ?? 0
  const leftH = st.resetMs / H
  const left: Span[] = isNameless ? [] : [[`${st.name} `, MUTED], [pctText(st, o), st.colors[1], true]]
  const needFill = st.isOver ? OVER : MUTED
  const n = hText(need)
  const rights: Span[][] = [
    [[`~${n} h needed`, needFill, st.isOver], [` · resets in ${untilText(st.resetMs)}`, MUTED]],
    [[`~${n} h needed`, needFill, st.isOver], [` · ${untilText(st.resetMs)}`, MUTED]],
    [[`~${n} h`, needFill, st.isOver], [` · ${untilText(st.resetMs)}`, MUTED]],
  ]
  const scale = (w - 2) / (Math.max(leftH, need) * 1.04)
  const tx = leftH * scale
  const by = y + 19
  const fill = Math.min(need, leftH) * scale
  const over = st.isOver
    ? `<rect x="${x + tx}" y="${by}" width="${(need - leftH) * scale}" height="${BAR}" fill="${OVER}" opacity="0.85"/><rect x="${x + tx}" y="${by}" width="${(need - leftH) * scale}" height="${BAR}" fill="url(#hatch)"/>`
    : ''
  return `<g><title>${esc(`${st.name} · ${st.left}% left · ${projText(st)}${st.isOver ? ` · ${shortText(st)}` : ''}`)}</title>` +
    labelRow(x, y, w, left, rights) +
    `<rect x="${x}" y="${by}" width="${tx}" height="${BAR}" rx="4" fill="${TRACK}"/>` +
    `<rect x="${x}" y="${by}" width="${Math.max(8, fill)}" height="${BAR}" rx="4" fill="url(#${gid(st)})"/>${over}` +
    `<line x1="${x + tx}" y1="${by - 3}" x2="${x + tx}" y2="${by + BAR + 3}" stroke="${MUTED}" stroke-width="1.2"/></g>`
}

const chipSpans = (st: Stats, win: Win, o: BandOpts): Span[] => [[`${st.name} `, MUTED], [pctText(st, o), st.colors[1], true], [` · ${win.when}`, MUTED]]
function weekChip(xRight: number, y: number, st: Stats, win: Win, o: BandOpts): string {
  return `<g><title>${esc(win.tip)}</title><text x="${xRight}" y="${y + LANE_H / 2 + 1}" text-anchor="end" dominant-baseline="central" ${FONT} font-size="12">${tspans(chipSpans(st, win, o))}</text></g>`
}

function bandHeight(v: number) {
  return v === 2 ? LANE_H * 2 + 6 : LANE_H
}

function bandSvg(v: number, W: number, five: Stats, week: Stats, w5: Win, w7: Win, o: BandOpts): string {
  const w = W - (o.isStale ? AGE_W : 0)
  const half = (w - GAP) / 2
  const bh = bandHeight(v)
  let body: string
  if (v === 0) body = timeLane(0, 0, half, five, w5, o) + pctLane(half + GAP, 0, half, week, w7, o)
  else if (v === 1) {
    const chipW = tw(chipSpans(week, w7, o)) + GAP
    body = timeLane(0, 0, w - chipW, five, w5, o) + weekChip(w, 0, week, w7, o)
  } else if (v === 2) body = pctLane(0, 0, half, five, w5, o) + pctLane(half + GAP, 0, half, week, w7, o) + timeLane(0, LANE_H + 6, w, five, w5, o, true)
  else if (v === 3) body = timeLane(0, 0, half, five, w5, o) + timeLane(half + GAP, 0, half, week, w7, o)
  else body = timeLane(0, 0, w, five, w5, o)
  const age = o.isStale
    ? `<text x="${W}" y="${bh / 2 + 1}" text-anchor="end" dominant-baseline="central" ${FONT} font-size="11" fill="${OVER}"><title>Last Reading ${STALE_MIN} min ago</title>${STALE_MIN} min old</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${bh}" viewBox="0 0 ${W} ${bh}"><defs>${grad('b5', WARM)}${grad('b7', COOL)}${HATCH}</defs>` +
    `<g opacity="${o.isStale ? 0.45 : 1}">${body}</g>${age}</svg>`
}

// Terminal: no Svg, so one line of text per window.
function bandText(v: number, five: Stats, week: Stats, w5: Win, w7: Win, o: BandOpts): string {
  const t = o.isStale ? '~' : ''
  const fiveT = five.burn === undefined
    ? `5-hour ${t}${five.left}% · ${w5.when} · Burn Rate after 1 h of Active Use`
    : `5-hour ${t}${five.left}% · ~${hText(five.needH ?? 0)} h needed · resets in ${untilText(five.resetMs)}${five.isOver ? ' (short)' : ''}`
  const weekT = `Weekly ${t}${week.left}% · ${w7.when}`
  return [fiveT, v === 4 ? '' : weekT, o.isStale ? `${STALE_MIN} min old` : ''].filter(Boolean).join('   ')
}

// ---------- the mod ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ai-pal-proto', description: 'PROTOTYPE: open the ai-pal band layouts pane' })
    $.clock.every(60_000, () => update($, tick, n => n + 1))
    void $.ui.open({ id: PANE, title: 'ai-pal' })
    return next(e)
  })

  on('command.run', { command: 'ai-pal-proto' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'ai-pal', columns: 44 })
    return { text: opened.isPlaced ? 'ai-pal pane opened.' : `Not placed: ${opened.reason}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isBandOn))) return next(e)
    const { Box, Text, Svg } = $.ui.resolve(e) as any
    await read($, tick)
    const now = await $.clock.now()
    const s = SCENARIOS[(await read($, scenario)) % SCENARIOS.length]!
    const v = await read($, band)
    const o: BandOpts = { isStale: await read($, isStale), isCountdown: await read($, isCountdown) }
    const five = stats(s, 'five_hour')
    const week = stats(s, 'seven_day')
    const [w5, w7] = ringWins(s, now)
    if (!Svg) return <Box><Text dimColor={o.isStale}>{bandText(v, five, week, w5, w7, o)}</Text></Box>
    // The band reports width in code-font cells only; ~7.2px a cell is a guess.
    const W = Math.max(320, Math.floor(e.props.bodyColumns * CELL_PX) - 4)
    return (
      <Box flexDirection="row">
        <Svg isInteractive source={bandSvg(v, W, five, week, w5, w7, o)} alt={bandText(v, five, week, w5, w7, o)} width={W} height={bandHeight(v)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Svg } = $.ui.resolve(e) as any
    await read($, tick)
    const now = await $.clock.now()
    const v = await read($, band)
    const bandOn = await read($, isBandOn)
    const stale = await read($, isStale)
    const countdown = await read($, isCountdown)
    const sIdx = await read($, scenario)
    const s = SCENARIOS[sIdx % SCENARIOS.length]!
    const five = stats(s, 'five_hour')
    const week = stats(s, 'seven_day')
    const both = [five, week]
    const W = Math.max(260, Math.floor((e.props.bodyColumns ?? 44) * CELL_PX) - 8)
    const svg = (source: string, alt: string, width: number, height: number, isInteractive = true) =>
      Svg ? <Svg isInteractive={isInteractive} source={source} alt={alt} width={width} height={height} /> : <Text dimColor>[{alt}]</Text>
    const [w5, w7] = ringWins(s, now)
    const noBurn = <Text color={MUTED} size="footnote">Burn Rate after 1 h of Active Use</Text>
    const shown = { five_hour: await read($, shownFive), seven_day: await read($, shownWeek) }

    // The history pane that won #14 (D · Time bars, reworked), unchanged.
    const history = (
      <Box flexDirection="column" gap={2}>
        {both.map(st => {
          const newest = [...st.past].reverse()
          const n = Math.min(shown[st.kind], newest.length)
          const rows = newest.slice(0, n)
          return (
            <Box flexDirection="column" gap={0}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text weight="semibold" size="footnote" color={st.colors[1]}>{st.name}</Text>
                {st.burn === undefined ? <Text /> : (
                  <Text size="footnote" tabular color={st.isOver ? OVER : MUTED}>{projText(st)}</Text>
                )}
              </Box>
              {st.burn === undefined ? noBurn : svg(timeBarSvg(W, st), `${st.name}: ${projText(st)}`, W, 28)}
              {st.burn !== undefined && <Text size="caption" color={MUTED} tabular>at {rateText(st.burn)}%/h of Active Use</Text>}
              <Box marginTop={1}><Text size="caption" color={MUTED} weight="semibold">LOST AT RESET</Text></Box>
              {rows.length === 0
                ? <Text size="caption" color={MUTED}>no past windows yet</Text>
                : svg(periodRowsSvg(W, st, rows, now), `${st.name} Lost Allowance, last ${rows.length} periods`, W, rows.length * ROW_H)}
              {st.past.length > 0 && (
                <Box flexDirection="row" justifyContent="space-between" marginTop={0}>
                  <Text size="footnote" tabular weight="semibold">{st.avg === undefined ? 'avg —' : `avg ${st.avg}% lost`}</Text>
                  <Text size="caption" color={MUTED} tabular>{`${st.exact} of ${st.past.length} windows · ${st.kind === 'five_hour' ? 'last 7 days' : 'last 4 weeks'}`}</Text>
                </Box>
              )}
              {(n < newest.length || n > 5) && (
                <Box flexDirection="row" gap={1} marginTop={1}>
                  {n < newest.length && (
                    <Button key={`more-${st.kind}`} variant="secondary" label={`More (${newest.length - n} older)`}
                      onPress={() => (st.kind === 'five_hour' ? update($, shownFive, k => k + 5) : update($, shownWeek, k => k + 5))} />
                  )}
                  {n > 5 && (
                    <Button key={`less-${st.kind}`} variant="secondary" label="Show 5"
                      onPress={() => (st.kind === 'five_hour' ? update($, shownFive, () => 5) : update($, shownWeek, () => 5))} />
                  )}
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Text size="caption" color={MUTED} weight="semibold">BAND ABOVE THE PROMPT</Text>
        <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
          <Button key="prev" label="◀" onPress={() => update($, band, n => (n + BANDS.length - 1) % BANDS.length)} />
          <Text weight="semibold">{String.fromCharCode(65 + v)} · {BANDS[v]}</Text>
          <Button key="next" label="▶" onPress={() => update($, band, n => (n + 1) % BANDS.length)} />
        </Box>
        <Text size="footnote" color={MUTED}>{BAND_NOTES[v]}</Text>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Button key="scn" variant="secondary" label={`Data: ${s.name}`} onPress={() => update($, scenario, n => (n + 1) % SCENARIOS.length)} />
          <Button key="stale" variant="secondary" label={stale ? `Reading: ${STALE_MIN} min old` : 'Reading: fresh'} onPress={() => update($, isStale, b => !b)} />
          <Button key="noburn" variant="secondary" label={`Under 1 h: ${countdown ? 'countdown' : '% bar'}`} onPress={() => update($, isCountdown, b => !b)} />
          <Button key="bandon" variant="secondary" label={bandOn ? 'Band: on' : 'Band: off'} onPress={() => update($, isBandOn, b => !b)} />
        </Box>
        <Text size="caption" color={MUTED}>
          {s.activeH < 1 ? 'This data has < 1 h of Active Use: no Burn Rate yet.' : five.isOver ? '5-hour overruns its Reset in this data.' : '5-hour fits before its Reset in this data.'}
        </Text>
        <Box flexDirection="column" alignItems="center" marginTop={1}>
          {svg(splitRingSvg(180, w5, w7), 'Usage Windows', 180, 180)}
        </Box>
        {history}
        <Text dimColor size="caption" mono>
          [proto] surface={e.surface} cols={e.props.bodyColumns} drawW={W} activeH={s.activeH}
        </Text>
      </Box>
    )
  })
}
