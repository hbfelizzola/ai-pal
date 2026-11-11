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
