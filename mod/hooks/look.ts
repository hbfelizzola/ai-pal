// Colours and markup helpers. Svg can't read theme keys, so the colours are
// fixed hex, checked on light and dark.

export type Pair = readonly [from: string, to: string]

/** The 5-hour window. */
export const WARM: Pair = ['#F6A15B', '#E0703F']
/** The weekly window. */
export const COOL: Pair = ['#9A9AF7', '#5E5ED8']
export const TRACK = 'rgba(142,142,142,0.28)'
export const MUTED = '#8E8E8E'
/** A booked Nudge's dot, Use more, and figures that may be wrong. */
export const AMBER = '#E5A50A'
export const NUDGE = AMBER
/** Ease off. */
export const GREY = '#A7A7A7'

export const font = 'font-family="-apple-system,system-ui,sans-serif"'

export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

export const gradient = (id: string, c: Pair) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient>`
