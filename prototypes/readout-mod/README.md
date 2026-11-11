# PROTOTYPE, throw away: ai-pal readout variants

Throwaway Claude Code mod that answered "What does the mod show at a glance?"
(hbfelizzola/ai-pal#6). Not production code: no error handling, mock data.

- Pane: five switchable layouts (◀ ▶). **A · Split ring** won: one 180px ring,
  5-hour arc 10→2 o'clock, weekly arc the rest, both anchored at 10 o'clock,
  figures in the centre, hover tooltip per arc.
- Band above the prompt: two gradient progress bars side by side (won).
- "Data" cycles live readings and mock scenarios; "Preview Nudge" sends the
  draft notification.

Load it with `claude --plugin-dir prototypes/readout-mod`, then `/ai-pal-proto`.

## Failure states (hbfelizzola/ai-pal#11)

`degraded-states.html` (open it in a browser, no build) draws nine failure
scenarios side by side (nothing stored, stale, Reset passed, signed out,
unreadable reply, one window missing, Nudge due on a stale reading) under four
treatments, switched with the bottom bar or ← →: **A · Footnote**, **B · Fade**,
**C · Status chip**, **D · Withhold**. The ring and bar drawing is ported from
`hooks/register.tsx`.

## History and Burn Rate layouts (hbfelizzola/ai-pal#14)

`hooks/register.tsx` now draws the winning split ring with four layouts under
it for Lost Allowance history, Burn Rate and the projection, switched with
◀ ▶: **A · Stacked by window** (column chart per window), **B · Table by
metric** (text only), **C · Tiles** (2×2 grid), **D · Time bars** (projection
first, history as dots). "History" cycles mock scenarios: Typical week, Quiet
week (< 1 h Active Use), First days, Heavy user. The five readout variants and
the band from #6 are in this branch's history (commit 87df395).
