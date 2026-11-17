// The split ring's markup: the 5-hour arc across the top from 10 to 2
// o'clock, the weekly arc through the bottom, each filled by its Unused
// Allowance and anchored at 10 o'clock, figures in the centre.
import { COOL, MUTED, NUDGE, TRACK, WARM, esc, font, gradient } from './look'

/** One half of the ring, as the readout decided to show it. */
export type Half = {
  /** Unused Allowance to fill the arc with; absent draws the track alone. */
  fill?: number
  /** The centre figure: `62%`, `~62%`, `Reset`, `…`. */
  big: string
  /** Under the figure: `5-hour · 3h 9m`. */
  label: string
  /** The arc's hover text. */
  tip?: string
  isDashed: boolean
  isFaded: boolean
  isNudgeBooked: boolean
}

export function ringSvg(size: number, five: Half, week: Half): string {
  const sw = size * 0.09
  const m = size / 2
  const r = (size - sw) / 2 - 1
  // Degrees between the arcs measured past the round caps (which reach sw/2
  // beyond each end), so the visible gap at 10 and 2 o'clock stays ~9°.
  const gap = 9 + ((sw / r) * 180) / Math.PI
  const pt = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return `${(m + r * Math.cos(a)).toFixed(2)} ${(m + r * Math.sin(a)).toFixed(2)}`
  }
  const arc = (from: number, to: number) => `M ${pt(from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${pt(to)}`
  const seg = (from: number, to: number, half: Half, stroke: string, isFromEnd: boolean) => {
    from += gap / 2
    to -= gap / 2
    const len = ((to - from) * Math.min(100, Math.max(0, half.fill ?? 0))) / 100
    const a = isFromEnd ? to - Math.max(1, len) : from
    const b = isFromEnd ? to : from + Math.max(1, len)
    const dash = half.isDashed ? ` stroke-dasharray="${(sw * 0.35).toFixed(1)} ${(sw * 0.55).toFixed(1)}"` : ''
    const cap = half.isDashed ? 'butt' : 'round'
    return `<g opacity="${half.isFaded ? 0.4 : 1}">${half.tip ? `<title>${esc(half.tip)}</title>` : ''}` +
      `<path d="${arc(from, to)}" fill="none" stroke="${TRACK}" stroke-width="${sw}" stroke-linecap="${cap}"${dash}/>` +
      (half.fill !== undefined && half.fill > 0
        ? `<path d="${arc(a, b)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`
        : '') +
      `<path d="${arc(from, to)}" fill="none" stroke="transparent" stroke-width="${sw * 2.5}"/></g>`
  }
  // The figures are sized for a 180px ring and stay so: a wider ring leaves
  // the centre's labels clear of the arcs.
  const k = 1
  const block = (half: Half, color: string, y: number) =>
    `<g opacity="${half.isFaded ? 0.4 : 1}">${half.tip ? `<title>${esc(half.tip)}</title>` : ''}` +
    `<text x="${m}" y="${y}" text-anchor="middle" dominant-baseline="central" ${font} font-weight="650" font-size="${(30 * k).toFixed(1)}" fill="${half.isDashed ? MUTED : color}">${esc(half.big)}</text>` +
    `<text x="${m}" y="${(y + 22 * k).toFixed(1)}" text-anchor="middle" dominant-baseline="central" ${font} font-size="${(11 * k).toFixed(1)}" fill="${MUTED}">${
      half.isNudgeBooked ? `<tspan fill="${NUDGE}">● </tspan>` : ''
    }${esc(half.label)}</text></g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<defs>${gradient('g5', WARM)}${gradient('g7', [COOL[1], COOL[0]])}</defs>` +
    seg(300, 420, five, 'url(#g5)', false) +
    seg(60, 300, week, 'url(#g7)', true) +
    block(five, WARM[1], m - 36 * k) +
    `<line x1="${m - 26 * k}" y1="${m}" x2="${m + 26 * k}" y2="${m}" stroke="${TRACK}" stroke-width="1"/>` +
    block(week, COOL[1], m + 24 * k) +
    `</svg>`
}
