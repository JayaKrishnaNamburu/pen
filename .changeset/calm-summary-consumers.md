---
"@input/pen-undo": patch
"@input/pen-ai": patch
"@input/pen-multiplayer": patch
---

Map undo carets, suggestion ranges, autocomplete anchors, and stale multiplayer selections through change summaries.

Undo restore uses `summaryLog.between`. Suggestions and autocomplete ghosts die when `mapRange` / `mapPoint` returns null. Remote awareness payloads now carry `commitId`.
