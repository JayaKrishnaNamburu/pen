---
"@input/pen-test": patch
---

Add `assertPeerEditsSurvive` so two-peer tests cannot pass when both documents converge on the same lost edit.

`assertDocEquals` only checks that two documents match. Independently seeded peers that exchange full state keep one `Y.Text` and drop the other insert; equality still passes. The helper now fails on that fixture, rejects a same-editor self-copy, and passes only when both named tokens are present on distinct editors. `createTestCollaboration` forks both peers from one encoded seed.
