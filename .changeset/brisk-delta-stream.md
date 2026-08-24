---
"@input/pen-ai": patch
"@input/pen-types": patch
---

Route generation deltas through `editor.openTextStream` instead of a direct Y.Text write.

`gen-start` / `gen-delta` / `gen-end` are unchanged. Awareness streaming flags now follow `source: "stream"` commits.
