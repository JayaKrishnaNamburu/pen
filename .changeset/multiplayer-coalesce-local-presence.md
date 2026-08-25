---
"@input/pen-multiplayer": patch
---

Stop remote carets from freezing and jumping while a peer types.

Local presence was published on every selection change, which outruns COL2's per-peer intake budget as soon as someone types quickly or drags a selection. A receiver that rate-limits an update keeps the sender's _previous_ caret, so a 32-character burst produced 22 `presence-rejected` / `rate-limited` diagnostics and a caret that lagged behind the text.

Presence writes are now coalesced to one per `LOCAL_PRESENCE_MIN_INTERVAL_MS` (50ms): the first move of an interval publishes immediately, and everything after it folds into a single trailing write carrying the latest selection. `MAX_PRESENCE_UPDATES_PER_SECOND` rises from 10 to 30 so the accepted rate has headroom above what a sender can now produce.

Hosts need no change. Presence is last-value-wins, so no state is lost — only redundant frames.
