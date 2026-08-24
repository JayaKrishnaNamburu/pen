---
"@input/pen-ai": patch
---

Refuse writes through a live `delta-stream:target` writer during a read-only tool call.

`gen-start` parks a `TextStreamWriter` on the streaming slot as `_writer`. The read-only guard patched `appendDelta` and `openTextStream` but not that writer, so a model-driven read-only tool could call `_writer.append` / `_writer.splice`, or the original `appendDelta` on the prototype, and change the document. The guard now disables every writer-shaped object on the slot for the call.
