---
"@input/pen-delta-stream": patch
---

Handle every inbound stream part and refuse protocol mismatches.

`processStream` now switches exhaustively over `PenStreamPart`, applies layout and app mutations, diagnoses tool-output/tool-error and malformed frames instead of throwing, and closes a stream whose protocol version does not match.
