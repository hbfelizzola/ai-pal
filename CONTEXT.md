# ai-pal

A personal companion that shows how much of your Claude plan's usage you have left and nudges you to use it before it resets.

## Language

**Usage Window**:
A fixed period over which a Claude plan meters usage against a cap, such as the 5-hour session limit or the weekly limit. It ends at a **Reset**.
_Avoid_: Quota period, cycle, bucket

**Reset**:
The moment a Usage Window ends and its usage returns to zero.
_Avoid_: Refresh, renewal

**Unused Allowance**:
The share of a Usage Window's cap still unspent at a given moment; whatever remains at the Reset is lost.
_Avoid_: Leftover, remaining quota, wasted usage, "giving usage away"
