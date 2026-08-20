---
"@input/pen-types": patch
"@input/pen-core": patch
---

Add `editor.openTextStream` and a `stream-open` op so streaming writes go through the commit pipeline.

Each flush is one `source: "stream"` commit. Open-time hooks can veto the stream; `position` maps through later summaries, including remotes.
