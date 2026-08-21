---
"@input/pen-test": patch
---

Add `assertPeerEditsSurvive` so two-peer tests cannot pass when both documents converge on the same lost edit.

`assertDocEquals` only checks that two documents match. The earlier SCALE1 concurrent-peers grade used that after independently seeded peers exchanged full state, so peer B's insert disappeared and the suite still passed. The helper now fails on that fixture and passes on `createTestCollaboration`, which forks both peers from one encoded seed.
