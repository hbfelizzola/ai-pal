# What can a Claude desktop app mod do?

Research for issue #3 (part of #1). Researched 2026-11-11.

## Sources

All claims cite the primary sources the engine itself ships with the
`plugin-authoring` skill (Claude Code **2.1.321**, the engine bundled with the
desktop app at the time of writing; the separately installed CLI here was
2.1.307):

- **[types]** `types/claude-code.d.ts`: the engine's own TypeScript declaration
  of the whole mod API (about 23,500 lines). The reference note calls it "the
  authority". Line numbers below point into it.
- **[ref]** `reference.md`: the long-form guide to the same API.
- **[skill]** `SKILL.md`: the summary table of surfaces and nouns.

The API is labelled **early access: "this surface may change between releases
without notice"** [types, header]. Re-check anything here against the types
file of whatever build we target.

## TL;DR

A mod can read the plan's Usage Windows directly. `$.session.usage()` and the
pushed `session.measure` event return `rateLimits`: `five_hour` and
`seven_day` windows, each with `percentUsed` (0 to 100) and a `resetsAt` ISO
timestamp. A mod can draw them in a **Pane** beside the chat or a **band above
the prompt** on the desktop surface. It can poll on a timer with
`$.clock.every`, keep history in `$.store` across sessions, and schedule a
**native notification up to 7 days ahead** (`$.ui.notify` with `at` /
`delayMs` / `untilBack`) that the client holds "so it can fire with the
session out of reach". There are three main limits:
1. Everything runs **only while a Claude Code session is alive**.
2. The rate-limit figures are **only as fresh as the session's last model
   response**.
3. A mod lives in **Claude Code sessions** (the desktop app's Code tab, the
   CLI, VS Code, the mobile remote surface). It does not run in an ordinary
   claude.ai chat.

## 1. Where a mod runs

- A mod is a Claude Code plugin made of "function hooks": a TypeScript or JS
  module exporting `register(on, options)`. Every hook is `($, e, next)`
  [ref §"What a plugin of function hooks is"].
- It runs "in an environment of its own, with no DOM and no Node: everything
  outside it is reached through `$`" [ref; types header]. There is no global
  `fetch`, `setTimeout` or `require`. The only globals are `h`/`Fragment` and
  a set of web APIs (URL, TextEncoder, AbortController, crypto.subtle)
  [types, header lines 15-27].
- Surfaces are `terminal`, `desktop` ("Claude Code Desktop"), `vscode` and
  `mobile`. The last three "ask over the wire" [types 11417-11432]. "A local
  session the desktop app starts for its Code tab" loads user-scope mods, and
  "its `ui.render` hooks draw for the `desktop` surface" [ref, end of
  "Sharing a mod"].
- Under a host that attaches no surface, "hooks, tools and commands run and
  nothing drawn shows" [types 11425-11427].
- **Implication:** the mod sees usage only from inside a Claude Code session.
  Usage spent in ordinary claude.ai chats still shows up, because the windows
  are account-wide (see §6), but the mod itself is not present in those chats.

## 2. Surfaces it can render

| Surface | API | Desktop? | Notes |
| --- | --- | --- | --- |
| **Pane** (framed region beside / above the chat) | `$.ui.open({ id, title })` + `ui.render` on `{ component: 'Pane', requestId: id }` | Yes. "Raised on every attached surface" [types 11296] | `placement: 'dock'` (beside the transcript) or `'inline'` (above the prompt) [types 11318-11324]. One instance per id, several panes become tabs. Opening one unasked (from a timer or `session.start`) can leave it unplaced (`isPlaced: false`); the width floors (144/110 columns) are described for the terminal [types 2551-2574, 15740-15790]. |
| **Band above the prompt** | `ui.render` on `{ component: 'AbovePrompt' }` | Yes. "terminal and desktop surfaces only" [types 11233] | The person can collapse it (`isCollapsed`); `maxRows`, `bodyColumns` given [types 11235-11287]. Good for a one-line "62% of 5h left, resets 14:30". |
| **Status line** | `$.ui.status(text)` from any hook | Text limit given "10000 remotely" [types 2539-2550] | One per plugin, pinned under the prompt; `undefined` clears it. |
| **Toast** | `$.ui.toast(text, { timeoutMs })` | Yes (remote limit 10,000 chars) | A few seconds (default 4,000 ms), top right, click to dismiss [types 2487-2503]. |
| **Native OS notification** | `$.ui.notify(text, { title, key, at, delayMs, untilBack })` | Yes, via `channel: 'client'` | See §5. |
| Transcript line / placed row | `$.ui.log`, `$.ui.place` | Yes | Display only; the model never reads it [types 2455-2470, 2602-2613]. |
| Backdrop / theme | `$.theme.set` + `Backdrop` render | Desktop and mobile only [types 11381] | Not needed here. |
| Others | `ToolUse`, `UserMessage`, `PromptHint`, `SessionMode` (desktop); `Spinner` (not mobile); `ToolProgress`, `TurnDuration`, `InfoNotice` (terminal only) | [types 10666-11233] | |

The desktop element table is `Box, Text, Button, Input, Select, Svg, Link,
Code, Markdown, Client`. It has **`Svg`** (useful for a gauge or bar chart)
but no `Raster`/`Image`, which are terminal-only [types 4081-4096]. Mobile has
the same table without `Client` [types 4108-4118].

Interaction: Buttons, Inputs and Selects raise `ui.press` / `ui.input` /
`ui.select` back into the mod. Slash commands come from
`$.command.register` + `command.run` [ref "Drawing"; skill table]. Values a
drawing reads go in `$.state` (session-scoped, survives hot reload), and a
`$.state.set` redraws the readers [ref; types 1220-1260 rel.].

## 3. Timers and background work

- `$.clock.now/sleep/after/every`. `every(ms, fn)` "calls `fn` every `ms`
  milliseconds (at least 1) until `cancel()`" [types `clock` noun, ~3630-3670].
- A hook has a time budget. "Work meant to outlive a dispatch" should be
  started from `session.start` and kept going with `$.clock.every` /
  `$.clock.after`, "whose timers run until cancelled or until the module
  reloads" [ref §"Work that outlives a dispatch"]. A hot reload cancels
  pending waits [types `clock` doc].
- `$.prompt.submit` can queue a prompt "once the session is idle", so
  "background work can wake a quiet session" [ref]. This could nudge the
  user, but it **spends** allowance itself.
- `$.process.spawn` can keep a child process for the session's life [types
  `process.spawn` example].
- **Limit:** none of this outlives the Claude Code session process. A
  `session.end` hook gets "one short bound" [types 4681-4684, 4697-4699].
  There is no documented daemon or background mode once the session or app is
  closed.

## 4. Network and local files

**Network: `$.http.fetch(url, init)`** [types `http` noun ~3673-3712; `HttpInit` 5521-5570]
- It goes "through the host (never the plugin's own network)", http or https,
  "to whatever the host reaches, unless the organization's web-fetch policy
  refuses it".
- Init options are `{ method, headers, body, auth, socketPath }`. The response
  is `{ status, ok, headers, text }`.
- **`auth`**: the handle from **`$.session.authorize()`**. "Holds the
  session's Anthropic credential on the host and answers an opaque handle and
  its kind; the secret never reaches the plugin". The engine sets the
  credential header "only for a first-party host", https only. It is null for
  a third-party provider, a gateway or no login. The kind is
  `'bearer' | 'api-key'` [types 3058-3069, 11785-11795].
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` refuses any plugin request that
  carries `auth`.
- Other mods, or an organization's guard, can hook `http.fetch` and deny it.

**Files: `$.fs.read/write/list/exists/stat/ancestors`** [types `fs` noun ~3427-3555]
- Paths are relative to the working directory or absolute. Reads are capped
  at 4 MiB. `exists` rejects network locations.
- No permission prompt or sandbox is documented for `$.fs`. The model's tool
  permission rules govern tool calls, not `$.fs`, and the reference's own
  examples show mods *acting as* path guards. Calls are events (`fs.read`,
  ...) that a mod above, such as an org policy mod, could refuse.
- `$.process.run(argv)` runs host commands "as the user the session runs as.
  CLI only", with a default timeout of 30 s and a maximum of 10 min [types
  `process` noun ~3714-3760]. A desktop Code-tab session is the local CLI
  engine run headless [ref "Developing one"], so this should be available
  there, but **verify**.
- `$.settings.read()` is read-only and "the OAuth session and the global
  config (~/.claude.json) are not settings and are never read" [types
  `settings` noun]. `$.session.identity()` (plan, email, org) answers
  `{ deny }` to any mod the org did not install through managed settings,
  "a contract, not a wall: any mod can read the person's own config file"
  [types 3070-3081].

## 5. Persisting state, and notifying when the app is not in front

**State**
- `$.store.get/set/delete/keys`: the plugin's own JSON key-value store, "kept
  between sessions and hot reloads". It is a JSON file under the user's
  Claude Code config directory, at most 4 MiB in total [types `store` noun
  ~3555-3590].
- `$.state` holds named, versioned values for one session. They survive hot
  reloads but not the session, so you "persist through `$.store`" [types
  `state` noun]. A reload means new code meets old values; use `atom(..., {
  shape })` to version them [ref "Drawing"].

**Notifications**
- `$.ui.notify(text, { title })` raises "a native notification ... through
  the person's own notification channel". In a session with no terminal (the
  desktop), "a host that raises notifications is handed it", and the result
  is `channel: 'client'`, which "does not report back" [types 2504-2526,
  15701-15738].
- **Scheduled notifications** [`NotifyOptions`, types 7146-7175]:
  - `delayMs` or `at` (epoch ms): "Milliseconds a client holds it before
    raising it, **so it can fire with the session out of reach**". More than
    7 days ahead rejects. A terminal ignores both and fires at once.
  - `untilBack: true`: "a client throws it away if the person returns to the
    session before it fires, so it can only speak to someone who left".
  - `key`: sending again replaces it, and `$.ui.cancelNotify(key)` takes it
    back.
- This is the closest thing to "notify when the app is closed or minimised".
  When usage data arrives, a mod can (re)book one keyed notification at, for
  example, `resetsAt - 1h` ("you still have X% Unused Allowance") with
  `untilBack`, and cancel it if the allowance gets spent.
- **Unverified:** whether the desktop app still raises a booked notification
  after the app is fully **quit**, not just minimised. The types say only "a
  client holds it". The mobile app is also a client, and an iOS local
  notification would survive the app closing, but that is not stated.
- `$.ui.notify` returns `no-surface` "where the session holds no terminal (a
  `-p` run, the SDK ...)" or with no host that raises notifications
  [ref "Work that outlives a dispatch"; types 15724-15737].
- **OS-level fallback** (an inference, not a mod feature): through
  `$.process.run`, the mod could install a macOS `launchd` agent, or call
  `osascript -e 'display notification ...'`, to notify when no Claude session
  is running. A launchd job runs outside the app and would need its own way
  to get usage data (§6).

## 6. Getting the usage data (the constraint that matters most)

**Built-in, no network call:** [types 2982-3003, 4685-4696, 12204-12246, 12396-12414, 12813-12848]

```ts
const { rateLimits } = await $.session.usage()
// rateLimits: { kind: 'five_hour' | 'seven_day' | string, percentUsed: number, resetsAt?: string }[]
on('session.measure', ($, e, next) => { /* e.rateLimits, e.changed */ return next(e) })
```

- These are "the rate-limit windows the last API response reported"
  (`five_hour`, `seven_day`, or a gateway's `spend_limit`). `kind` is typed as
  `string`, so other windows, such as a per-model weekly window, may appear.
- The list is "**empty off a subscription or before the first reading**".
  On API-key or Console billing there is no data.
- `session.measure` is **pushed** "after each main-thread turn, and when a
  rate-limit window moves a whole point", and also when "the account's limit
  status changed". It needs no polling.
- The plain `$.session.usage()` call "costs nothing".
- **Freshness limit:** figures come from response headers, so they update
  only when this session makes a model request. A session left idle shows
  stale numbers, though `resetsAt` is still correct for computing a
  countdown. Usage spent elsewhere (claude.ai chat, another session) shows up
  only at this session's next request. **Open question:** whether a cheap
  `$.model.complete` (a single completion; usage is billed to the session's
  credentials [ref]) refreshes `rateLimits`. Even if it does, each refresh
  spends a small amount of allowance.

**Active fetch (possible, unverified endpoint):** `$.session.authorize()` +
`$.http.fetch(firstPartyUrl, { auth })` lets a mod call an Anthropic
first-party endpoint with the user's own subscription credential, without
ever seeing the token. The types do not name a usage endpoint or define
"first-party host". Which endpoint, if any, returns plan usage, as `/usage`
in Claude Code shows it, is a follow-up research question.

**What a mod cannot easily do:** read the OAuth token itself. It is never
exposed to the plugin, and `settings.read` and `identity()` do not give it
out. An out-of-app process such as a launchd job or an iOS widget gets no
`authorize()` handle. Such a process needs either data the mod writes for it
(for example a JSON snapshot via `$.fs.write` or `$.store`) or its own
credential path.

## 7. Are tool-call hooks relevant?

Mostly not. `tool.call` hooks block, rewrite or react to the model's tool
calls [skill table; types `tool.call`]. The relevant events here are
`session.start` (start timers, register commands, open the pane),
`session.measure` (usage moved), `turn.complete` (a turn ended, which is a
natural moment to refresh the band), `session.end` (persist a snapshot), and
`ui.press` / `command.run` for interaction. A `prompt.submit` hook could add
a reminder at the moment the user sends a prompt, but that is optional.

## Design implications for ai-pal

1. **Data source:** use `session.measure` and `$.session.usage().rateLimits`
   first. It is free, official and already has `percentUsed` + `resetsAt` per
   Usage Window. Show "last updated" because the data can be stale.
2. **Display:** an `AbovePrompt` band for the one-line summary, and a `Pane`
   (Svg bars) for the detail. Both work on the desktop surface.
3. **Nudge:** keep one keyed `$.ui.notify({ at: resetsAt - lead, untilBack:
   true, key: 'unused-<window>' })` per Usage Window and re-book it on every
   measurement. Also toast in-session when the Reset is near and the Unused
   Allowance is large.
4. **History:** keep the past Resets and the last snapshot in `$.store`.
5. **Outside the app:** needs either OS scheduling (`launchd`) or a companion
   widget fed by a snapshot file the mod writes. This is out of the mod's own
   scope.

## Open questions / follow-ups

- Does a booked `$.ui.notify({ at })` fire after the desktop app is quit?
  (Needs a test.)
- Does `$.model.complete` refresh `rateLimits`, and what does it cost?
- Is there a first-party usage endpoint usable with `$.session.authorize()`?
- Does `$.process.run` work in a desktop Code-tab session? (Documented as
  "CLI only".)
- Which `kind` values appear beyond `five_hour` / `seven_day` for Pro vs Max?
