---
"@input/pen-dom": patch
"@input/pen-types": patch
---

Version the Pen clipboard payload so readers can refuse unknown shapes instead of guessing. Partial inline copies keep an `isPartial` flag so paste inserts into the current block.

Copy now writes a `PenClipboardPayload` envelope (`version`, `blockTypes`, `blocks`). Paste of a newer or unreadable JSON flavor falls back to HTML or plain text with a diagnostic and does not half-consume the blocks.
