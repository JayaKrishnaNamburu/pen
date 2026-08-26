---
"@input/pen-vue": patch
"@input/pen-history": patch
"@input/pen-shortcuts": patch
---

Document the Vue binding, history and shortcuts public surfaces. All 35 exported symbols across the three packages gained TSDoc, closing the DOC3 doc-coverage ratchet regression that landed when `packages/rendering/vue/api-report.md` first brought the Vue surface into the counted population. No behavior or API change: comments are stripped from the published bundles, verified against the `@input/pen-vue` size budget.

The prose states the things the types cannot. `useEditor` destroys an editor it created and leaves a passed-in one alone. `toggleInlineMark` removes a mark only when every character in range carries it, and falls back to a pending mark when the selection is collapsed, while `setInlineMark` refuses a collapsed selection because there is no pending-mark equivalent for a caller-chosen value. History attribution reports an opaque client handle unless the host supplies `resolveAuthor`, and the peer-asserted `displayHint` is never promoted into `author`. A Vue block renderer must call `renderInlineContent()` for text to stay editable, since Pen reconciles that subtree itself.
