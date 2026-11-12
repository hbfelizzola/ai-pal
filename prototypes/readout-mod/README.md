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

## The band above the prompt → a Burn Rate speedometer (hbfelizzola/ai-pal#17)

Five band layouts with the 5-hour time bar, three wordings and the Burn Rate
were tried (commit 7a184d3) and didn't read clearly; the band time bar is left
to v2. Instead, the pane gets a **Burn Rate speedometer** under the ring:

- The needle is the Burn Rate (%/h of Active Use). Three zones on the dial:
  amber below r1, the window's colour from r1 to r2, grey above r2.
- r1 = Unused Allowance ÷ the Active Use you can expect before the Reset
  (5-hour: the time to Reset, nonstop; weekly: your usual share of Active Use,
  rolling 7 days, of the time to Reset); r2 = 2 × r1.
- The centre shows the rate and one of three calls: **Use more** · or a bigger
  model (below r1: some would go unused), **On track** · keep this pace,
  **Ease off** · or a lighter model (above r2: runs out with time to spare).
  A caption under it says why (`~26% would go unused even nonstop · resets in
  2h 0m`).
- Under 1 h of Active Use: an empty dial with `Burn Rate after 1 h of Active Use`.

◀ ▶ switch **A · 5-hour gauge** and **B · Two gauges**; **Data** cycles the
mock scenarios (Steady added for On track); **Time bars** keeps or drops #14's
time bars under the history.
