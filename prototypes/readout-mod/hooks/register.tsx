// PROTOTYPE, throw away. Answers "How do the history and Burn Rate sections
// look under the ring?" (hbfelizzola/ai-pal#14): four layouts for Lost
// Allowance history, Burn Rate and the projection, drawn under the split ring
// that won "What does the mod show at a glance?" (#6). ◀ ▶ switch the layout,
// "History" cycles mock scenarios. Nothing here reads real history.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Reading } from '../types'

const PANE = 'ai-pal'
const variant = atom({ plugin: 'ai-pal-readout-prototype', key: 'variant' } as const, 3)
const scenario = atom({ plugin: 'ai-pal-readout-prototype', key: 'scenario' } as const, 0)
const shownFive = atom({ plugin: 'ai-pal-readout-prototype', key: 'shownFive' } as const, 5)
const shownWeek = atom({ plugin: 'ai-pal-readout-prototype', key: 'shownWeek' } as const, 5)
const tick = atom({ plugin: 'ai-pal-readout-prototype', key: 'tick' } as const, 0)

const VARIANTS = ['Stacked by window', 'Table by metric', 'Tiles', 'Time bars']
const H = 3_600_000

// Window identities from #6: warm 5-hour, cool weekly. Fixed hex for both themes.
const WARM = ['#F6A15B', '#E0703F']
const COOL = ['#9A9AF7', '#5E5ED8']
const NUDGE = '#E5A50A'
const OVER = '#E5A50A'
const MUTED = '#8E8E8E'
const TRACK = 'rgba(142,142,142,0.28)'
const CELL_PX = 7.2
const FONT = 'font-family="-apple-system,system-ui,sans-serif"'
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const grad = (id: string, c: string[], vertical = false) =>
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
  colors: string[]
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

// Columns, one per past window, height ∝ Lost Allowance. Exact: gradient fill.
// Upper bound: dashed outline, faint fill. No data: grey dot on the baseline.
// Reset early: small ↺ above. Zero: a 2px stub, so it can't pass for no data.
function columnsSvg(w: number, h: number, st: Stats, now: number, axis?: [string, string]): string {
  const n = Math.max(st.past.length, 1)
  const axisH = axis ? 12 : 0
  const base = h - axisH - 2
  const topPad = 10
  const max = Math.max(25, Math.ceil(Math.max(0, ...st.past.map(p => p.lost ?? 0)) / 25) * 25)
  const slot = w / n
  const cw = Math.min(16, slot * 0.62)
  const id = `c${st.kind}`
  const color = st.colors[1]
  const cols = st.past.map((p, i) => {
    const cx = slot * i + slot / 2
    const x = cx - cw / 2
    const tip = `<title>${esc(pastTip(st, p, now))}</title>`
    const hit = `<rect x="${slot * i}" y="0" width="${slot}" height="${base}" fill="transparent"/>`
    if (p.lost === undefined)
      return `<g>${tip}${hit}<circle cx="${cx}" cy="${base - 2}" r="2.2" fill="${MUTED}" opacity="0.7"/></g>`
    const ch = Math.max(2, ((base - topPad) * p.lost) / max)
    const y = base - ch
    const body = p.isUpper
      ? `<rect x="${x + 0.5}" y="${y + 0.5}" width="${cw - 1}" height="${ch - 1}" rx="2" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-dasharray="2 2"/>`
      : `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="2" fill="url(#${id})"/>`
    const early = p.isEarly ? `<text x="${cx}" y="${y - 3}" text-anchor="middle" ${FONT} font-size="9" fill="${MUTED}">&#8634;</text>` : ''
    return `<g>${tip}${hit}${body}${early}</g>`
  })
  const grid = `<line x1="0" y1="${topPad}" x2="${w}" y2="${topPad}" stroke="${TRACK}" stroke-dasharray="2 3"/><text x="${w}" y="${topPad - 2}" text-anchor="end" ${FONT} font-size="8" fill="${MUTED}">${max}%</text>`
  const baseline = `<line x1="0" y1="${base + 0.5}" x2="${w}" y2="${base + 0.5}" stroke="${TRACK}"/>`
  const ax = axis
    ? `<text x="0" y="${h - 2}" ${FONT} font-size="9" fill="${MUTED}">${axis[0]}</text><text x="${w}" y="${h - 2}" text-anchor="end" ${FONT} font-size="9" fill="${MUTED}">${axis[1]}</text>`
    : ''
  const empty = st.past.length === 0
    ? `<text x="${w / 2}" y="${base / 2 + 4}" text-anchor="middle" ${FONT} font-size="10" fill="${MUTED}">no past windows yet</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${grad(id, st.colors, true)}</defs>${grid}${baseline}${cols.join('')}${empty}${ax}</svg>`
}

// Dots, one per past window: radius ∝ Lost Allowance. Hollow = upper bound,
// grey = no data, outer ring = reset early.
function dotsSvg(w: number, st: Stats, now: number): string {
  const h = 16
  const n = Math.max(st.past.length, 1)
  const slot = Math.min(w / n, 18)
  const color = st.colors[1]
  const dots = st.past.map((p, i) => {
    const cx = slot * i + slot / 2
    const tip = `<title>${esc(pastTip(st, p, now))}</title>`
    if (p.lost === undefined) return `<g>${tip}<circle cx="${cx}" cy="8" r="1.8" fill="${MUTED}"/></g>`
    const r = 1.5 + (p.lost / 100) * 5.5
    const dot = p.isUpper
      ? `<circle cx="${cx}" cy="8" r="${r}" fill="none" stroke="${color}" stroke-dasharray="1.5 1.5"/>`
      : `<circle cx="${cx}" cy="8" r="${r}" fill="${color}"/>`
    const ring = p.isEarly ? `<circle cx="${cx}" cy="8" r="${r + 2}" fill="none" stroke="${MUTED}" stroke-width="0.8"/>` : ''
    return `<g>${tip}<rect x="${slot * i}" y="0" width="${slot}" height="${h}" fill="transparent"/>${dot}${ring}</g>`
  })
  const empty = st.past.length === 0 ? `<text x="0" y="11" ${FONT} font-size="10" fill="${MUTED}">no past windows yet</text>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${dots.join('')}${empty}</svg>`
}

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

// ---------- the pane ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ai-pal-proto', description: 'PROTOTYPE: open the ai-pal history layouts pane' })
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
    const v = await read($, variant)
    const sIdx = await read($, scenario)
    const s = SCENARIOS[sIdx % SCENARIOS.length]
    const five = stats(s, 'five_hour')
    const week = stats(s, 'seven_day')
    const both = [five, week]
    const W = Math.max(260, Math.floor((e.props.bodyColumns ?? 44) * CELL_PX) - 8)
    const svg = (source: string, alt: string, width: number, height: number, isInteractive = true) =>
      Svg ? <Svg isInteractive={isInteractive} source={source} alt={alt} width={width} height={height} /> : <Text dimColor>[{alt}]</Text>
    const [w5, w7] = ringWins(s, now)
    const noBurn = <Text color={MUTED} size="footnote">Burn Rate after 1 h of Active Use</Text>
    const axisOf = (st: Stats): [string, string] => (st.kind === 'five_hour' ? ['7 days ago', 'now'] : ['4 weeks ago', 'last Reset'])
    const sectionTitle = (t: string) => <Text weight="semibold" size="footnote" color={MUTED}>{t.toUpperCase()}</Text>

    let body
    if (v === 0) {
      // A · Stacked by window: one block per window — chart, average, then
      // Burn Rate + projection. Overrun: the projection line turns amber.
      body = (
        <Box flexDirection="column" gap={2}>
          {both.map(st => (
            <Box flexDirection="column" gap={0}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text weight="semibold" color={st.colors[1]}>{st.name}</Text>
                <Text color={MUTED} size="footnote" tabular>{avgText(st)}</Text>
              </Box>
              {svg(columnsSvg(W, 58, st, now, axisOf(st)), `${st.name} Lost Allowance per past window`, W, 58)}
              {st.burn === undefined ? noBurn : (
                <Text size="footnote" tabular>
                  <Text color={MUTED}>Burn Rate </Text>
                  <Text weight="semibold">{rateText(st.burn)}%/h</Text>
                  <Text color={MUTED}> · </Text>
                  <Text color={st.isOver ? OVER : undefined} weight={st.isOver ? 'semibold' : undefined}>
                    {projText(st)}{st.isOver ? ` · ${shortText(st)}` : ''}
                  </Text>
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )
    } else if (v === 1) {
      // B · Table by metric: no charts. Three sections, each a 5-hour row and a
      // Weekly row. Series as text, newest last. Overrun: amber dot + "short".
      const row = (st: Stats, right: any) => (
        <Box flexDirection="row" gap={1}>
          <Box width={8}><Text color={st.colors[1]} weight="semibold" size="footnote">{st.name}</Text></Box>
          <Box flexGrow={1} flexShrink={1}>{right}</Box>
        </Box>
      )
      body = (
        <Box flexDirection="column" gap={1}>
          {sectionTitle('Lost at Reset')}
          {both.map(st =>
            row(st, (
              <Box flexDirection="column">
                <Text mono size="caption" color={MUTED}>{st.past.length ? st.past.map(entryText).join(' ') : '—'}</Text>
                <Text size="footnote" tabular>{avgText(st)}</Text>
              </Box>
            )))}
          {sectionTitle('Burn Rate · 7 days of Active Use')}
          {s.activeH < 1 ? noBurn : both.map(st => row(st, <Text size="footnote" tabular>{rateText(st.burn ?? 0)}%/h <Text color={MUTED}>of the cap</Text></Text>))}
          {sectionTitle('To spend what is left')}
          {s.activeH < 1 ? noBurn : both.map(st =>
            row(st, (
              <Text size="footnote" tabular>
                {st.isOver ? <Text color={OVER}>● </Text> : ''}
                {projText(st)}
                {st.isOver ? <Text color={OVER} weight="semibold">{` · ${shortText(st)}`}</Text> : ''}
              </Text>
            )))}
          <Text color={MUTED} size="caption">≤ upper bound · – no data · ↺ reset early</Text>
        </Box>
      )
    } else if (v === 2) {
      // C · Tiles: a 2×2 grid echoing the ring's two halves. Top: average lost
      // with a small chart. Bottom: Burn Rate with the projection.
      // Overrun: the tile gets an amber border.
      const TW = Math.floor((W - 12) / 2) - 18
      const tile = (key: string, color: any, children: any) => (
        <Box key={key} width="48%" borderStyle="round" borderColor={color ?? TRACK} paddingX={1} flexDirection="column">{children}</Box>
      )
      body = (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" justifyContent="space-between">
            {both.map(st =>
              tile(`h${st.kind}`, undefined, (
                <>
                  <Text size="caption" color={MUTED}>{st.name} · lost at Reset</Text>
                  <Text size="heading" weight="semibold" color={st.colors[1]} tabular>{st.avg === undefined ? '—' : `${st.avg}%`}</Text>
                  <Text size="caption" color={MUTED}>{st.past.length ? `avg · ${st.exact} of ${st.past.length} windows` : 'no past windows yet'}</Text>
                  {svg(columnsSvg(TW, 34, st, now), `${st.name} Lost Allowance per past window`, TW, 34)}
                </>
              )))}
          </Box>
          <Box flexDirection="row" justifyContent="space-between">
            {both.map(st =>
              tile(`b${st.kind}`, st.isOver ? OVER : undefined, (
                <>
                  <Text size="caption" color={MUTED}>{st.name} · Burn Rate</Text>
                  {st.burn === undefined ? (
                    <><Text size="heading" weight="semibold" color={MUTED}>—</Text><Text size="caption" color={MUTED}>after 1 h of Active Use</Text></>
                  ) : (
                    <>
                      <Text size="heading" weight="semibold" tabular>{rateText(st.burn)}%/h</Text>
                      <Text size="caption" tabular color={st.isOver ? OVER : MUTED}>~{hText(st.needH ?? 0)} h needed</Text>
                      <Text size="caption" tabular color={MUTED}>resets in {untilText(st.resetMs)}</Text>
                    </>
                  )}
                </>
              )))}
          </Box>
        </Box>
      )
    } else {
      // D · Time bars, projection first: per window a bar of time to Reset with
      // the Active Use needed laid over it; overrun spills past the Reset tick
      // in amber. Under it, the last 5 past periods as rows (newest first), the
      // average below them, and "More" adding 5 older periods at a time.
      const shown = { five_hour: await read($, shownFive), seven_day: await read($, shownWeek) }
      body = (
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
                      <Button
                        key={`more-${st.kind}`}
                        variant="secondary"
                        label={`More (${newest.length - n} older)`}
                        onPress={() => (st.kind === 'five_hour' ? update($, shownFive, k => k + 5) : update($, shownWeek, k => k + 5))}
                      />
                    )}
                    {n > 5 && (
                      <Button
                        key={`less-${st.kind}`}
                        variant="secondary"
                        label="Show 5"
                        onPress={() => (st.kind === 'five_hour' ? update($, shownFive, () => 5) : update($, shownWeek, () => 5))}
                      />
                    )}
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
          <Button key="prev" label="◀" onPress={() => update($, variant, n => (n + VARIANTS.length - 1) % VARIANTS.length)} />
          <Text weight="semibold">{String.fromCharCode(65 + v)} · {VARIANTS[v]}</Text>
          <Button key="next" label="▶" onPress={() => update($, variant, n => (n + 1) % VARIANTS.length)} />
          <Button key="scn" variant="secondary" label={`History: ${s.name}`} onPress={() => update($, scenario, n => (n + 1) % SCENARIOS.length)} />
        </Box>
        <Box flexDirection="column" alignItems="center">
          {svg(splitRingSvg(180, w5, w7), 'Usage Windows', 180, 180)}
        </Box>
        {body}
        <Text dimColor size="caption" mono>
          [proto] surface={e.surface} cols={e.props.bodyColumns} drawW={W} activeH={s.activeH}
        </Text>
      </Box>
    )
  })
}
