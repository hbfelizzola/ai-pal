# ai-pal mod

The Claude Code mod from the v1 spec (hbfelizzola/ai-pal#18). It shows your
plan's Unused Allowance per Usage Window in a docked Pane and in a band above
the prompt, and books Nudges before a Reset while you're away. `/ai-pal`
shows and changes its settings.

Needs Claude Code 2.1.325 or newer (the build that has `$.ui.cancelNotify`).

Load it for a session:

```bash
claude --plugin-dir mod
```

Run its tests (every test drives the mod through its edge with the engine):

```bash
claude plugin test mod
```

Nudges are booked only from sessions in the Claude desktop app: a terminal
ignores a notification's delivery time and would show it at once.
