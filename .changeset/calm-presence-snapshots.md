---
"@input/pen-multiplayer": patch
---

Keep mapped remote presence snapshots referentially stable between awareness and commit updates.

`getRemoteCursors`, `getRemoteSelections`, `getPeers`, and `getState` now reuse the last mapped arrays and the stored state object when `summaryLog` and the last accepted awareness map are unchanged. React 19 `useSyncExternalStore` requires that identity; a new array on every read after Wave 2.6 mapping looped `MultiplayerCaretOverlay` to a crash.
