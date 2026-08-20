---
"@input/pen-ai": patch
---

Register suggest-mode as a `pen.beforeApply` facet provider at `high`.

The apply monkey-patch is gone. Suggest-mode transforms ops through `transformOpsForSuggestMode` inside the facet hook. `interceptApplyForSuggestMode` is deleted. Stream-open ops pass through so `TextStreamWriter` can open under suggest-mode.
