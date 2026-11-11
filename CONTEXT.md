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

**Nudge**:
A reminder, sent only to someone who has left the session, that a Usage Window still has Unused Allowance shortly before its Reset.
_Avoid_: Alert, warning (those suggest hitting a cap, which ai-pal does not cover)

**Quiet Hours**:
A daily span of local time in which no Nudge is delivered.
_Avoid_: Do-not-disturb, mute (those belong to the OS)

**Burn Rate**:
How fast you spend a Usage Window's cap while actively using Claude, measured as percent of the cap per hour of active use. Never measured in tokens.
_Avoid_: Token rate, spend speed
