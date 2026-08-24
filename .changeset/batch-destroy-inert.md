---
"@input/pen-delta-stream": patch
---

Make a destroyed BatchingBuffer inert so later append/flush cannot schedule another write.
