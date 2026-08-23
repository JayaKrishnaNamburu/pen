---
"@input/pen-bench": patch
---

Give three benches a post-clock observation so a silently no-op measurement fails by name.

`crdt.fork-merge-100` merged a fork into itself, so the state-vector diff was empty and the clock could publish a no-op; the fork now diverges first and the merge is asserted to have transferred onto a named block. `generateGenDeltaParts` was exported but never reached the clock — the 1000-part streaming bench inlined its own delta loop — and is now consumed inside the timed region, gated on the part count both before and after. The autocomplete requesting-cancel-churn and provider-budget benches timed `setTimeout` inside the provider stream with no floor subtracted, and now carry a yield floor plus a named request-count assertion.
