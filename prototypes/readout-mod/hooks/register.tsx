// PROTOTYPE, throw away. Answers "What does the mod show at a glance?"
// (hbfelizzola/ai-pal#6): four readout variants in one Pane, switched with the
// ◀ ▶ buttons, fed by live readings or mock scenarios, plus an optional band
// above the prompt (the fallback placement) and a Nudge preview.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Reading } from '../types'

const PANE = 'ai-pal'
const variant = atom({ plugin: 'ai-pal-readout-prototype', key: 'variant' } as const, 0)
const scenario = atom({ plugin: 'ai-pal-readout-prototype', key: 'scenario' } as const, 0)
const isBandOn = atom({ plugin: 'ai-pal-readout-prototype', key: 'isBandOn' } as const, false)
const live = atom({ plugin: 'ai-pal-readout-prototype', key: 'live' } as const, [], { shape: 'live-1' })
const tick = atom({ plugin: 'ai-pal-readout-prototype', key: 'tick' } as const, 0)

const VARIANTS = ['Split ring', 'Twin rings', 'Hero + list', 'Concentric', 'Text strip']
const SCENARIOS = ['Live', 'Fresh', 'Nudge due', 'Nearly spent', 'Model weekly']

// Fixed hex: Svg can't use theme keys, so these must read on light and dark.
const ARC = '#D97757'
const ARC_NUDGE = '#E5A50A'
const TRACK = 'rgba(142,142,142,0.28)'

const H = 3_600_000
const LABEL: Record<string, string> = {
  five_hour: '5-hour',
  seven_day: 'Weekly',
  seven_day_opus: 'Weekly · Opus',
  seven_day_sonnet: 'Weekly · Sonnet',
}
const label = (kind: string) => LABEL[kind] ?? kind

function mock(n: number, now: number): Reading[] {
  const at = (ms: number) => new Date(now + ms).toISOString()
  switch (n) {
    case 1:
      return [
        { kind: 'five_hour', percentUsed: 12, resetsAt: at(4.67 * H) },
        { kind: 'seven_day', percentUsed: 18, resetsAt: at(126 * H) },
      ]
    case 2:
      return [
        { kind: 'five_hour', percentUsed: 38, resetsAt: at(0.87 * H) },
        { kind: 'seven_day', percentUsed: 61, resetsAt: at(20 * H) },
      ]
    case 3:
      return [
        { kind: 'five_hour', percentUsed: 91, resetsAt: at(2.17 * H) },
        { kind: 'seven_day', percentUsed: 88, resetsAt: at(48 * H) },
      ]
    default:
      return [
        { kind: 'five_hour', percentUsed: 30, resetsAt: at(3 * H) },
        { kind: 'seven_day', percentUsed: 45, resetsAt: at(75 * H) },
        { kind: 'seven_day_opus', percentUsed: 70, resetsAt: at(75 * H) },
        { kind: 'seven_day_sonnet', percentUsed: 20, resetsAt: at(75 * H) },
      ]
  }
}

const left = (r: Reading) => Math.max(0, Math.round(100 - r.percentUsed))
const msToReset = (r: Reading, now: number) =>
  r.resetsAt ? Date.parse(r.resetsAt) - now : undefined

function untilText(ms: number | undefined): string {
  if (ms === undefined) return 'Reset unknown'
  if (ms <= 0) return 'resetting'
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

function resetClock(r: Reading): string {
  if (!r.resetsAt) return ''
  const d = new Date(r.resetsAt)
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  return `${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Nudge rules from "When does a nudge fire?": 5-hour 1 h before Reset if
// ≥ 40% left; weekly 24 h and 3 h before if ≥ 30% left. Quiet hours ignored here.
type Nudge = { reading: Reading; firesIn: number }
function nextNudge(rs: Reading[], now: number): Nudge | undefined {
  const out: Nudge[] = []
  for (const r of rs) {
    const ms = msToReset(r, now)
    if (ms === undefined || ms <= 0) continue
    const rule =
      r.kind === 'five_hour' ? { leads: [1 * H], min: 40 }
      : r.kind === 'seven_day' ? { leads: [24 * H, 3 * H], min: 30 }
      : undefined
    if (!rule || left(r) < rule.min) continue
    for (const lead of rule.leads) {
      if (ms > lead) out.push({ reading: r, firesIn: ms - lead })
      else if (lead === rule.leads[rule.leads.length - 1]) out.push({ reading: r, firesIn: 0 })
    }
  }
  return out.sort((a, b) => a.firesIn - b.firesIn)[0]
}

const isNudgeDue = (r: Reading, now: number) => {
  const n = nextNudge([r], now)
  return n !== undefined && n.firesIn === 0
}

function nudgeText(n: Nudge, now: number): string {
  return `${label(n.reading.kind)}: ${left(n.reading)}% left, resets in ${untilText(msToReset(n.reading, now))}. Use it before it's gone.`
}

function ringSvg(size: number, pct: number, color: string, center?: string): string {
  const sw = Math.max(3, size * 0.1)
  const r = (size - sw) / 2
  const c = 2 * Math.PI * r
  const dash = (c * Math.min(100, pct)) / 100
  const text = center
    ? `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,system-ui,sans-serif" font-weight="600" font-size="${size * 0.24}" fill="${color}">${center}</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${TRACK}" stroke-width="${sw}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dash} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>${text}</svg>`
}

// Window identities: warm for the 5-hour window, cool for the weekly one.
const WARM = ['#F6A15B', '#E0703F']
const COOL = ['#9A9AF7', '#5E5ED8']
const NUDGE = '#E5A50A'
const MUTED = '#8E8E8E'
const CELL_PX = 7.2
const FONT = 'font-family="-apple-system,system-ui,sans-serif"'
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const grad = (id: string, c: string[]) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient>`

type Win = { pct: number; tip: string; when: string; isDue: boolean }

// One ring: the 5-hour arc runs 10 → 2 o'clock across the top, the weekly arc
// takes the rest (2 → 10 through the bottom). Each fills by its
// Unused Allowance from 10 o'clock, so both empty toward 2 o'clock; the
// full figures sit in the middle. isInteractive Svg on
// desktop shows each arc's <title> on hover.
function splitRingSvg(size: number, five?: Win, week?: Win): string {
  const sw = size * 0.075
  const m = size / 2
  const r = (size - sw) / 2 - 1
  const gap = 10
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

// The band: two progress bars side by side, labels in the drawing itself.
function barsSvg(w: number, five?: Win, week?: Win): string {
  const gapX = 28, h = 34, bw = (w - gapX) / 2
  const bar = (x: number, win: Win | undefined, name: string, id: string, color: string) => {
    if (!win) return ''
    const fill = (bw * Math.min(100, win.pct)) / 100
    return `<g><title>${esc(win.tip)}</title>` +
      `<text x="${x}" y="11" dominant-baseline="central" ${FONT} font-size="12" fill="${MUTED}">${win.isDue ? `<tspan fill="${NUDGE}">&#9679; </tspan>` : ''}${name}</text>` +
      `<text x="${x + bw}" y="11" text-anchor="end" dominant-baseline="central" ${FONT} font-size="12" fill="${MUTED}"><tspan font-weight="650" fill="${color}">${win.pct}%</tspan> &#183; ${esc(win.when)}</text>` +
      `<rect x="${x}" y="24" width="${bw}" height="8" rx="4" fill="${TRACK}"/>` +
      (fill > 0 ? `<rect x="${x}" y="24" width="${Math.max(8, fill)}" height="8" rx="4" fill="url(#${id})"/>` : '') +
      `</g>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${grad('b5', WARM)}${grad('b7', COOL)}</defs>${bar(0, five, '5-hour', 'b5', WARM[1])}${bar(bw + gapX, week, 'Weekly', 'b7', COOL[1])}</svg>`
}

function toWin(r: Reading | undefined, now: number): Win | undefined {
  if (!r) return undefined
  const ms = msToReset(r, now)
  const when = r.kind === 'five_hour' || (ms !== undefined && ms < 24 * H) ? untilText(ms) : resetClock(r)
  return { pct: left(r), when, isDue: isNudgeDue(r, now), tip: `${label(r.kind)} · ${left(r)}% left · resets in ${untilText(ms)}` }
}

function concentricSvg(size: number, rings: { pct: number; color: string }[]): string {
  const sw = size * 0.09
  const parts = rings.map((ring, i) => {
    const r = size / 2 - sw / 2 - i * (sw + 4)
    const c = 2 * Math.PI * r
    const dash = (c * Math.min(100, ring.pct)) / 100
    const m = size / 2
    return `<circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="${TRACK}" stroke-width="${sw}"/><circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="${ring.color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dash} ${c}" transform="rotate(-90 ${m} ${m})"/>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${parts.join('')}</svg>`
}

const bar = (pct: number, cells = 12) => {
  const n = Math.round((Math.min(100, pct) / 100) * cells)
  return '█'.repeat(n) + '░'.repeat(cells - n)
}

async function readings($: any): Promise<{ rs: Reading[]; source: string; now: number }> {
  await read($, tick)
  const now = await $.clock.now()
  const s = await read($, scenario)
  if (s === 0) return { rs: await read($, live), source: 'live', now }
  return { rs: mock(s, now), source: `mock: ${SCENARIOS[s]}`, now }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ai-pal-proto', description: 'PROTOTYPE: open the ai-pal readout pane' })
    const usage = await $.session.usage()
    await update($, live, () => usage.rateLimits.map(r => ({ ...r })))
    $.clock.every(60_000, () => update($, tick, n => n + 1))
    void $.ui.open({ id: PANE, title: 'ai-pal' })
    return next(e)
  })

  on('command.run', { command: 'ai-pal-proto' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'ai-pal', columns: 44 })
    return { text: opened.isPlaced ? 'ai-pal readout pane opened.' : `Not placed: ${opened.reason}` }
  })

  on('session.measure', async ($, e, next) => {
    await update($, live, () => e.rateLimits.map(r => ({ ...r })))
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Svg } = $.ui.resolve(e) as any
    const v = await read($, variant)
    const s = await read($, scenario)
    const band = await read($, isBandOn)
    const { rs, source, now } = await readings($)
    const main = rs.filter(r => r.kind === 'five_hour' || r.kind === 'seven_day')
    const extra = rs.filter(r => r.kind.startsWith('seven_day_'))
    const nudge = nextNudge(rs, now)
    const colorOf = (r: Reading) => (isNudgeDue(r, now) ? ARC_NUDGE : ARC)
    const winOf = (kind: string) => toWin(rs.find(r => r.kind === kind), now)
    const slicesOf = (list: Reading[]) =>
      list.map(r => ({ pct: left(r), color: colorOf(r), tip: `${label(r.kind)} · ${left(r)}% left · resets in ${untilText(msToReset(r, now))}` }))
    const hasSvg = Boolean(Svg)
    const ring = (size: number, r: Reading, center?: string) =>
      hasSvg
        ? <Svg source={ringSvg(size, left(r), colorOf(r), center)} alt={`${label(r.kind)} ${left(r)}% left`} width={size} height={size} />
        : <Text color="claude">{bar(left(r), 10)}</Text>

    const nudgeLine = (
      <Text dimColor size="footnote">
        {nudge === undefined
          ? 'No Nudge booked: nothing above threshold.'
          : nudge.firesIn === 0
            ? `Nudge due now: ${label(nudge.reading.kind)}, ${left(nudge.reading)}% left`
            : `Next Nudge in ${untilText(nudge.firesIn)} (${label(nudge.reading.kind)}), if still ≥ threshold`}
      </Text>
    )
    const extraRows = extra.length > 0 && (
      <Box flexDirection="column" marginTop={1}>
        {extra.map(r => (
          <Text size="footnote">
            <Text dimColor>{label(r.kind)} </Text>
            {left(r)}% left
          </Text>
        ))}
      </Box>
    )

    let body
    if (main.length === 0) {
      body = <Text dimColor>No reading yet. Send a message, or switch Scenario to a mock.</Text>
    } else if (v === 0) {
      // A: Split ring, details in the centre
      body = (
        <Box flexDirection="column" gap={1} alignItems="center">
          {hasSvg ? (
            <Svg isInteractive source={splitRingSvg(180, winOf('five_hour'), winOf('seven_day'))} alt="Usage Windows" width={180} height={180} />
          ) : (
            <Text>No Svg on this surface.</Text>
          )}
          {extraRows}
          {nudgeLine}
        </Box>
      )
    } else if (v === 1) {
      // B: Twin rings
      body = (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={3} justifyContent="center">
            {main.map(r => (
              <Box flexDirection="column" alignItems="center">
                {ring(100, r, `${left(r)}%`)}
                <Text weight="semibold">{label(r.kind)}</Text>
                <Text dimColor size="footnote">left · resets in {untilText(msToReset(r, now))}</Text>
              </Box>
            ))}
          </Box>
          {extraRows}
          {nudgeLine}
        </Box>
      )
    } else if (v === 2) {
      // C: Hero + list — the window a Nudge points at (or the 5-hour) gets the ring
      const hero = nudge?.reading ?? main[0]
      const rest = rs.filter(r => r !== hero)
      body = (
        <Box flexDirection="column" alignItems="center" gap={1}>
          <Text weight="semibold" size="heading">{label(hero.kind)}</Text>
          {ring(120, hero, `${left(hero)}%`)}
          <Text>Unused Allowance · resets in {untilText(msToReset(hero, now))}</Text>
          {nudgeLine}
          <Box flexDirection="column" marginTop={1} width="100%">
            {rest.map(r => (
              <Box flexDirection="row" justifyContent="space-between">
                <Text dimColor>{label(r.kind)}</Text>
                <Text tabular>{left(r)}% left · {r.kind === 'five_hour' ? untilText(msToReset(r, now)) : resetClock(r)}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )
    } else if (v === 3) {
      // D: Concentric — outer weekly, inner 5-hour, legend beside
      const week = main.find(r => r.kind === 'seven_day')
      const five = main.find(r => r.kind === 'five_hour')
      const rings = [week, five].filter((r): r is Reading => r !== undefined)
      body = (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={2} alignItems="center">
            {hasSvg && (
              <Svg source={concentricSvg(100, rings.map(r => ({ pct: left(r), color: colorOf(r) })))} alt="Usage Windows" width={100} height={100} />
            )}
            <Box flexDirection="column" gap={1}>
              {rings.map(r => (
                <Box flexDirection="column">
                  <Text weight="semibold">{label(r.kind)} · {left(r)}% left</Text>
                  <Text dimColor size="footnote">
                    resets in {untilText(msToReset(r, now))}{r.kind === 'seven_day' ? ` (${resetClock(r)})` : ''}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>
          {extraRows}
          {nudgeLine}
        </Box>
      )
    } else {
      // E: Text strip — no gauge, dense rows
      body = (
        <Box flexDirection="column">
          {rs.map(r => (
            <Box flexDirection="row" gap={1}>
              <Box width={16}><Text dimColor>{label(r.kind)}</Text></Box>
              <Text color={isNudgeDue(r, now) ? 'warning' : 'claude'} mono>{bar(left(r))}</Text>
              <Text tabular> {left(r)}% · {untilText(msToReset(r, now))}</Text>
            </Box>
          ))}
          <Box marginTop={1}>{nudgeLine}</Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
          <Button key="prev" label="◀" onPress={() => update($, variant, n => (n + VARIANTS.length - 1) % VARIANTS.length)} />
          <Text weight="semibold">{String.fromCharCode(65 + v)} · {VARIANTS[v]}</Text>
          <Button key="next" label="▶" onPress={() => update($, variant, n => (n + 1) % VARIANTS.length)} />
          <Button key="scn" variant="secondary" label={`Data: ${SCENARIOS[s]}`} onPress={() => update($, scenario, n => (n + 1) % SCENARIOS.length)} />
          <Button key="band" variant="secondary" label={band ? 'Band: on' : 'Band: off'} onPress={() => update($, isBandOn, b => !b)} />
          <Button
            key="nudge"
            variant="secondary"
            label="Preview Nudge"
            onPress={async () => {
              const r = await readings($)
              const n = nextNudge(r.rs, r.now) ?? (r.rs[0] && { reading: r.rs[0], firesIn: 0 })
              if (!n) return $.ui.toast('No reading to nudge about')
              const text = nudgeText(n, r.now)
              await $.ui.notify(text, { title: 'ai-pal', key: 'preview' })
              $.ui.toast(`Sent: ${text}`)
            }}
          />
        </Box>
        {body}
        <Text dimColor size="caption" mono>
          [proto] surface={e.surface} placement={e.props.placement} cols={e.props.bodyColumns} viewportCols={(e as any).viewport?.columns} source={source}
          {'\n'}
          {JSON.stringify(rs.map(r => [r.kind, r.percentUsed, r.resetsAt?.slice(5, 16)]))}
        </Text>
      </Box>
    )
  })

  // Fallback placement: a band above the prompt — two bars, no prose.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, isBandOn))) return next(e)
    const { Box, Text, Svg } = $.ui.resolve(e) as any
    const { rs, now } = await readings($)
    const five = toWin(rs.find(r => r.kind === 'five_hour'), now)
    const week = toWin(rs.find(r => r.kind === 'seven_day'), now)
    if (!five && !week) return next(e)
    // The surface reports width in cells of its code font; ~7.2px a cell is a
    // conservative guess so the drawing never overflows the band.
    const bandWidth = Math.max(320, Math.floor(((e as any).viewport?.columns ?? 44) * CELL_PX) - 4)
    if (!Svg) {
      return (
        <Box flexDirection="row" gap={2}>
          {five && <Text><Text dimColor>5-hour </Text>{bar(five.pct, 10)} {five.pct}%</Text>}
          {week && <Text><Text dimColor>Weekly </Text>{bar(week.pct, 10)} {week.pct}%</Text>}
        </Box>
      )
    }
    return (
      <Box flexDirection="row">
        <Svg isInteractive source={barsSvg(bandWidth, five, week)} alt="Usage Windows" width={bandWidth} height={34} />
      </Box>
    )
  })
}
