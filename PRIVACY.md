# ai-pal privacy policy

Last updated: 18 November 2026

ai-pal is a Claude Code mod published by Humberto Bernardes Felizzola. This policy covers what the mod reads, sends and keeps. The author runs no server for ai-pal and receives no data from it.

## What it reads

- The usage figures Claude Code reports to your session after each response: the share of each usage window used and when it resets.
- When Claude ran a turn, counted in 5-minute slots, to work out your Active Use.
- Its own settings, set with `/ai-pal`.

It doesn't read your prompts, Claude's responses, your files or your credentials.

## What it sends

Every 5 minutes while a session is open, ai-pal asks your plan's usage endpoint at `https://api.anthropic.com/api/oauth/usage` for the same kind of figures, including model-specific weekly windows. The request goes to Anthropic, signed in as your session: Claude Code attaches the sign-in, and the mod never sees your credential. Anthropic's own privacy policy covers that request.

ai-pal sends nothing else, to Anthropic or anyone. There is no analytics, telemetry or crash reporting, and nothing goes to the author.

## What it keeps, and for how long

Everything stays on your machine, in ai-pal's own Claude Code plugin storage:

- Usage Readings: 7 days for the 5-hour window, 4 weeks for weekly windows.
- Active Use slots: 7 days.
- Your settings, and the Nudges booked as notifications with the Claude desktop app, until they fire or are cancelled.

Uninstalling the plugin stops all reading, sending and booking.

## Children

ai-pal isn't directed at people under 18.

## Changes and contact

Changes to this policy are published in this file, with its history in the repository. Questions go to [GitHub issues](https://github.com/hbfelizzola/ai-pal/issues).
