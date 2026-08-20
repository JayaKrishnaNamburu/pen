---
"@input/pen-core": patch
"@input/pen-dom": patch
---

Route editor failures through the diagnostic event channel.

Thrown event handlers and extension lifecycle failures emit diagnostics instead of writing to console, so hosts can capture them. A guarded console remains only as the default sink and when a diagnostic handler itself throws (CH5).
