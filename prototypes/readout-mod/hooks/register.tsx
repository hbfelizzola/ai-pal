// PROTOTYPE, throw away. "Should the band above the prompt show the 5-hour
// time bar?" (hbfelizzola/ai-pal#17) ended with the band left to v2 and a
// Burn Rate speedometer under the ring instead: needle at the Burn Rate,
// three zones, and in its centre one of three calls (Use more / On track /
// Ease off). ◀ ▶ switch one 5-hour gauge or two gauges, "Data" cycles mock
// scenarios, "Time bars" keeps or drops #14's time bars. Mock data only.
// The band layouts tried first are in this branch's history (7a184d3).
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const PANE = 'ai-pal'
const layout = atom({ plugin: 'ai-pal-readout-prototype', key: 'layout' } as const, 0)
const isTimeBars = atom({ plugin: 'ai-pal-readout-prototype', key: 'isTimeBars' } as const, true)
const scenario = atom({ plugin: 'ai-pal-readout-prototype', key: 'scenario' } as const, 0)
const shownFive = atom({ plugin: 'ai-pal-readout-prototype', key: 'shownFive' } as const, 5)
const shownWeek = atom({ plugin: 'ai-pal-readout-prototype', key: 'shownWeek' } as const, 5)
const tick = atom({ plugin: 'ai-pal-readout-prototype', key: 'tick' } as const, 0)

const H = 3_600_000

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
    name: 'Steady',
    now: { five: [55, 2.5], week: [40, 96] },
    five: spread([10, 4, 0, 18, 6, 2, 0, 9], 150),
    week: [{ lost: 12, agoH: 96 + 504 }, { lost: 7, agoH: 96 + 336 }, { lost: 15, agoH: 96 + 168 }, { lost: 5, agoH: 96 }],
    activeH: 26,
    burn: { five: 25, week: 1.4 },
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
  horizonH: number // Active Use you can expect before the Reset
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
    // 5-hour: nonstop to the Reset is realistic. Weekly: your usual share of
    // Active Use (rolling 7 days) of the time to Reset.
    horizonH: kind === 'five_hour' ? inH : (inH * s.activeH) / 168,
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

// ---------- the Burn Rate speedometer ----------

// What to do, from how much of the Active Use you can expect before the Reset
// you'd need to spend what's left at your Burn Rate (duty = Active Use needed
// ÷ horizon). 5-hour horizon: the time to Reset, nonstop. Weekly horizon: your
// usual share of Active Use over the time to Reset. Over 1: some goes unused.
// Under ½: it goes with time to spare. On the dial those become rates:
// r1 = left ÷ horizon (duty 1), r2 = 2 × r1 (duty ½).
type Verdict = { key: 'more' | 'track' | 'ease'; word: string; hint: string; color: string; detail: string }
const EASE = '#A7A7A7'
function verdict(st: Stats): Verdict | undefined {
  if (st.burn === undefined || st.needH === undefined) return undefined
  const duty = st.needH / Math.max(st.horizonH, 0.01)
  const until = untilText(st.resetMs)
  const how = st.kind === 'five_hour' ? 'even nonstop' : 'at your usual Active Use'
  if (duty > 1) {
    const unused = Math.max(1, Math.round(st.left - st.burn * st.horizonH))
    return { key: 'more', word: 'Use more', hint: 'or a bigger model', color: OVER, detail: `~${unused}% would go unused ${how} · resets in ${until}` }
  }
  if (duty >= 0.5)
    return { key: 'track', word: 'On track', hint: 'keep this pace', color: st.colors[1], detail: `spends it in ~${hText(st.needH)} h of use · ${until} left` }
  return { key: 'ease', word: 'Ease off', hint: 'or a lighter model', color: EASE, detail: `runs out after ~${hText(st.needH)} h of use · ${until} left` }
}
const zones = (st: Stats) => {
  const r1 = st.left / Math.max(st.horizonH, 0.01)
  return { r1, r2: 2 * r1 }
}
const niceMax = (v: number) => {
  const step = v <= 10 ? 2 : v <= 50 ? 10 : 20
  return Math.max(step, Math.ceil(v / step) * step)
}

const SWEEP = 240
function gaugeSvg(size: number, st: Stats): [svg: string, height: number] {
  const k = size / 200
  const sw = 13 * k
  const pad = 20 * k
  const r = size / 2 - sw / 2 - pad
  const cx = size / 2
  const cy = r + sw / 2 + pad
  const height = Math.ceil(cy + r * 0.5 + sw / 2 + 16 * k)
  const v = verdict(st)
  const { r1, r2 } = zones(st)
  const max = niceMax(Math.max(r2 * 1.5, (st.burn ?? 0) * 1.15))
  const ang = (val: number) => -SWEEP / 2 + (SWEEP * Math.min(max, Math.max(0, val))) / max
  const pt = (deg: number, rad = r) => {
    const a = ((deg - 90) * Math.PI) / 180
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)] as const
  }
  const P = (deg: number, rad = r) => pt(deg, rad).map(n => n.toFixed(2)).join(' ')
  const arc = (a: number, b: number) => `M ${P(a)} A ${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${P(b)}`
  const zone = (from: number, to: number, stroke: string, tip: string, opacity = 1) =>
    to > from ? `<g><title>${esc(tip)}</title><path d="${arc(ang(from), ang(to))}" fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${sw}"/></g>` : ''
  const label = (val: number, text: string) => {
    const [x, y] = pt(ang(val), r + sw / 2 + 7 * k)
    const a = ang(val)
    const anchor = a < -10 ? 'end' : a > 10 ? 'start' : 'middle'
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="central" ${FONT} font-size="${9.5 * k}" fill="${MUTED}">${esc(text)}</text>`
  }
  const k1 = rateText(r1), k2 = rateText(r2)
  let dial: string
  if (!v) {
    dial = `<path d="${arc(-SWEEP / 2, SWEEP / 2)}" fill="none" stroke="${TRACK}" stroke-width="${sw}"/>`
  } else {
    dial =
      zone(0, r1, OVER, `Below ${k1}%/h: some of the ${st.left}% left goes unused`, 0.75) +
      zone(r1, r2, st.colors[1], `${k1}–${k2}%/h: spends it in over half the Active Use you can expect before the Reset`, 0.85) +
      zone(r2, max, TRACK, `Above ${k2}%/h: runs out with time to spare`) +
      label(r1, k1) + label(r2, k2)
  }
  const end = (val: number, text: string) => {
    const [x, y] = pt(ang(val), r)
    return `<text x="${x.toFixed(1)}" y="${(y + sw / 2 + 8 * k).toFixed(1)}" text-anchor="middle" dominant-baseline="central" ${FONT} font-size="${9.5 * k}" fill="${MUTED}">${esc(text)}</text>`
  }
  const ends = v ? end(0, "0") + end(max, `${max}%/h`) : ""
  let pointer = ''
  if (v) {
    const a = ang(st.burn ?? 0)
    const [x1, y1] = pt(a, r - sw / 2 - 7 * k)
    const [x2, y2] = pt(a, r + sw / 2 + 1)
    pointer = `<g><title>${esc(`Burn Rate ${rateText(st.burn ?? 0)}%/h of Active Use`)}</title>` +
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(0,0,0,0.35)" stroke-width="${6 * k}" stroke-linecap="round"/>` +
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${v.color}" stroke-width="${3.5 * k}" stroke-linecap="round"/>` +
      `<circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="${3.5 * k}" fill="${v.color}"/></g>`
  }
  const centre = v
    ? `<text x="${cx}" y="${cy - 12 * k}" text-anchor="middle" dominant-baseline="central" ${FONT} font-weight="650" font-size="${26 * k}" fill="${st.colors[1]}">${rateText(st.burn ?? 0)}<tspan font-size="${13 * k}" font-weight="500" fill="${MUTED}">%/h</tspan></text>` +
      `<text x="${cx}" y="${cy + 14 * k}" text-anchor="middle" dominant-baseline="central" ${FONT} font-weight="650" font-size="${14 * k}" fill="${v.color}">${esc(v.word)}</text>` +
      `<text x="${cx}" y="${cy + 30 * k}" text-anchor="middle" dominant-baseline="central" ${FONT} font-size="${10.5 * k}" fill="${MUTED}">${esc(v.hint)}</text>`
    : `<text x="${cx}" y="${cy - 8 * k}" text-anchor="middle" dominant-baseline="central" ${FONT} font-weight="650" font-size="${24 * k}" fill="${MUTED}">—</text>` +
      `<text x="${cx}" y="${cy + 14 * k}" text-anchor="middle" dominant-baseline="central" ${FONT} font-size="${10.5 * k}" fill="${MUTED}">Burn Rate after</text>` +
      `<text x="${cx}" y="${cy + 28 * k}" text-anchor="middle" dominant-baseline="central" ${FONT} font-size="${10.5 * k}" fill="${MUTED}">1 h of Active Use</text>`
  return [`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 ${size} ${height}">${dial}${ends}${pointer}${centre}</svg>`, height]
}

// ---------- the pane ----------

const LAYOUTS = ['5-hour gauge', 'Two gauges']

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ai-pal-proto', description: 'PROTOTYPE: open the ai-pal pane with the Burn Rate speedometer' })
    $.clock.every(60_000, () => update($, tick, n => n + 1))
    void $.ui.open({ id: PANE, title: 'ai-pal' })
    return next(e)
  })

  on('command.run', { command: 'ai-pal-proto' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'ai-pal', columns: 44 })
    return { text: opened.isPlaced ? 'ai-pal pane opened.' : `Not placed: ${opened.reason}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Svg } = $.ui.resolve(e) as any
    await read($, tick)
    const now = await $.clock.now()
    const v = await read($, layout)
    const bars = await read($, isTimeBars)
    const s = SCENARIOS[(await read($, scenario)) % SCENARIOS.length]!
    const five = stats(s, 'five_hour')
    const week = stats(s, 'seven_day')
    const both = [five, week]
    const W = Math.max(260, Math.floor((e.props.bodyColumns ?? 44) * CELL_PX) - 8)
    const svg = (source: string, alt: string, width: number, height: number, isInteractive = true) =>
      Svg ? <Svg isInteractive={isInteractive} source={source} alt={alt} width={width} height={height} /> : <Text dimColor>[{alt}]</Text>
    const [w5, w7] = ringWins(s, now)
    const noBurn = <Text color={MUTED} size="footnote">Burn Rate after 1 h of Active Use</Text>
    const shown = { five_hour: await read($, shownFive), seven_day: await read($, shownWeek) }

    const gauge = (st: Stats, size: number, isNamed: boolean) => {
      const [source, gh] = gaugeSvg(size, st)
      const vd = verdict(st)
      const alt = vd ? `${st.name} Burn Rate ${rateText(st.burn ?? 0)}%/h: ${vd.word}, ${vd.hint}` : `${st.name}: Burn Rate after 1 h of Active Use`
      return (
        <Box flexDirection="column" alignItems="center" gap={0}>
          {isNamed && <Text weight="semibold" size="footnote" color={st.colors[1]}>{st.name}</Text>}
          {e.surface === 'terminal'
            ? (vd
              ? <Text><Text bold>{rateText(st.burn ?? 0)}%/h</Text> · <Text color={vd.color} bold>{vd.word}</Text> <Text dimColor>{vd.hint}</Text></Text>
              : <Text dimColor>Burn Rate after 1 h of Active Use</Text>)
            : svg(source, alt, size, gh)}
          {vd && <Text size="caption" color={MUTED} tabular>{vd.detail}</Text>}
        </Box>
      )
    }
    const gauges = v === 0
      ? <Box flexDirection="column" alignItems="center">{gauge(five, Math.min(W, 220), false)}</Box>
      : <Box flexDirection="row" justifyContent="space-between">{both.map(st => gauge(st, Math.floor((W - 12) / 2), true))}</Box>

    // The history pane that won #14 (D · Time bars, reworked); the time bars
    // can be dropped now the speedometer carries the projection.
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
                {bars && st.burn !== undefined ? <Text size="footnote" tabular color={st.isOver ? OVER : MUTED}>{projText(st)}</Text> : <Text />}
              </Box>
              {bars && (st.burn === undefined ? noBurn : svg(timeBarSvg(W, st), `${st.name}: ${projText(st)}`, W, 28))}
              {bars && st.burn !== undefined && <Text size="caption" color={MUTED} tabular>at {rateText(st.burn)}%/h of Active Use</Text>}
              <Box marginTop={bars ? 1 : 0}><Text size="caption" color={MUTED} weight="semibold">LOST AT RESET</Text></Box>
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
        <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
          <Button key="prev" label="◀" onPress={() => update($, layout, n => (n + LAYOUTS.length - 1) % LAYOUTS.length)} />
          <Text weight="semibold">{String.fromCharCode(65 + v)} · {LAYOUTS[v]}</Text>
          <Button key="next" label="▶" onPress={() => update($, layout, n => (n + 1) % LAYOUTS.length)} />
        </Box>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Button key="scn" variant="secondary" label={`Data: ${s.name}`} onPress={() => update($, scenario, n => (n + 1) % SCENARIOS.length)} />
          <Button key="bars" variant="secondary" label={bars ? 'Time bars: shown' : 'Time bars: dropped'} onPress={() => update($, isTimeBars, b => !b)} />
        </Box>
        <Box flexDirection="column" alignItems="center" marginTop={1}>
          {svg(splitRingSvg(180, w5, w7), 'Usage Windows', 180, 180)}
        </Box>
        {gauges}
        {history}
        <Text dimColor size="caption" mono>
          [proto] surface={e.surface} cols={e.props.bodyColumns} drawW={W} activeH={s.activeH}
        </Text>
      </Box>
    )
  })
}
