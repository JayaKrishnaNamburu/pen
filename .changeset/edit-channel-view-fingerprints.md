---
"@input/pen-ai": patch
---

Record a hash of each tracked block's rendered markdown on the working set, and treat a changed view as stale. Props that do not change the rendered markdown no longer count as stale. The hashes stay on the runtime envelope and are not sent to the model (`spec/packages/extensions/ai.md` EC7, EC8).
