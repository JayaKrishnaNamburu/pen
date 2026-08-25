---
"@input/pen-ai": patch
---

Correct four holes in streamed `edit_document` writes (EC20).

Every operation in a payload now streams and commits, not just the first: keys are read from one element of the `operations` array instead of scanned from the whole argument JSON, so a second operation's content no longer previews against the first one's target. Blocks written while a call streams are charged against the turn's op budget, stopping one op short of exhausting it so the closing call returns a refusal the model can read. Unicode escapes in a growing payload decode, and an escape that has not finished arriving is held back rather than written as its own characters.

`editStreaming` gains a third value: `"atomic" | "preview" | "commit"`, defaulting to `"commit"` (previous behaviour). `"preview"` shows the arriving text as a decoration and writes nothing until the call closes — the posture for hosts where an early write would be replicated to collaborators who would then watch it retract on a refusal.
