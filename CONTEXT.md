# ai-pal

A personal companion that shows how much of your Claude plan's usage you have left and nudges you to use it before it resets.

## Language

**Usage Window**:
A fixed period over which a Claude plan meters usage against a cap, such as the 5-hour session limit, the weekly limit, or a model-specific weekly limit. It ends at a **Reset**.
_Avoid_: Quota period, cycle, bucket

**Reset**:
The moment a Usage Window ends and its usage returns to zero.
_Avoid_: Refresh, renewal

**Unused Allowance**:
The share of a Usage Window's cap still unspent at a given moment; whatever remains at the Reset is lost.
_Avoid_: Leftover, remaining quota, wasted usage, "giving usage away"

**Lost Allowance**:
The Unused Allowance a Usage Window still had at its Reset. Known only from the last Reading before that Reset, so it is exact only when that Reading was recent.
_Avoid_: Wasted usage, unused at reset, leftover

**Reading**:
A record of one Usage Window's Unused Allowance and Reset as reported at one moment, together with that moment. A Reading is **stale** once it is too old to trust as the current figure.
_Avoid_: Sample, snapshot, data point

**Nudge**:
A reminder, sent only to someone who has left the session, that a Usage Window still has Unused Allowance shortly before its Reset.
_Avoid_: Alert, warning (those suggest hitting a cap, which ai-pal does not cover)

**Quiet Hours**:
A daily span of local time in which no Nudge is delivered.
_Avoid_: Do-not-disturb, mute (those belong to the OS)

**Active Use**:
Time you spend working with Claude, counted in 5-minute slots: a slot is active when Claude ran a turn in any session during it. It includes your reading and typing between turns, unlike Claude's own working time.
_Avoid_: Usage time, session time, compute time

**Burn Rate**:
How fast you spend a Usage Window's cap during Active Use, measured as percent of the cap per hour of Active Use. For a weekly Usage Window it is stated per day instead: percent of the cap per day of your usual Active Use. Never measured in tokens.
_Avoid_: Token rate, spend speed

**Pace Call**:
A judgment, per Usage Window, of whether your Burn Rate fits the Active Use you can expect before its Reset: **Use more** (some Unused Allowance would become Lost Allowance), **On track**, or **Ease off** (it would run out well before the Reset).
_Avoid_: Verdict, call (alone: clashes with tool and model calls), recommendation
