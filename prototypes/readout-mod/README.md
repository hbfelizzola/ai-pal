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

**D · Time bars won**, reworked: under each window's time bar, the last 5 past
periods as rows (newest first), the average below them, and **More** adding 5
older periods at a time (**Show 5** returns). The ring and all bars were made
thicker (ring stroke 9% of its size, bars 11px) and the ring's two arc gaps at
10 and 2 o'clock widened to ~9° clear of the round caps.

## The band above the prompt (hbfelizzola/ai-pal#17)

The band (`AbovePrompt`) is back, now with the 5-hour **time bar** from #14 at
band height (8px). The pane's top section switches it: ◀ ▶ step through five
layouts, **Data** cycles the mock scenarios (Typical week overruns the 5-hour
Reset, Heavy user fits, Quiet week has < 1 h of Active Use, First days just
overruns), **Reading** toggles a 42-min-old stale Reading, **Under 1 h** picks
what shows before there's a Burn Rate (the % bar or a countdown to Reset), and
**Band** turns it off.

- **A · Beside**: 5-hour time bar left, weekly Unused Allowance bar right.
- **B · Whole band**: 5-hour time bar across the band, weekly as a text chip.
- **C · Two rows**: #6's two bars, the 5-hour time bar under them.
- **D · Two time bars**: 5-hour and weekly time bars side by side.
- **E · Time bar only**: weekly leaves the band.

The history-layout switch from #14 is gone: the pane draws the winner (D · Time
bars) under the band controls.
