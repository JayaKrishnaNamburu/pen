---
"@input/pen-ai": patch
---

Close AIB5 stream-protocol gaps that mock apply-counts could not prove.

`processStream` now diagnoses a part without a string `type` instead of throwing in the DataPart guard. Document-level tests cover malformed and out-of-order close, missing target on a bare editor, and one-undo of a signal-cancelled prefix.
