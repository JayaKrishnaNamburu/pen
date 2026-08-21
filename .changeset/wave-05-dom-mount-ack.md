---
"@input/pen-dom": patch
"@input/pen-react": patch
"@input/pen-vue": patch
---

Add mount acknowledgement and park unmounted selection projections.

Hosts call `ackBlockMounted(blockId, element)` in the layout-effect phase (React `useLayoutEffect`, Vue `onMounted`/`onUpdated`). A projection whose target is not yet in the DOM parks by record version and flushes on ack in the same turn — no rAF wait. If the ack never comes, the park stays, `selection-target-unmounted` is emitted, `waitForAttachment` resolves false same-turn, and a newer version discards the park. The four-frame `waitForAttachment` poll and the cell-host retry are deleted.
