---
---

Add a Chromium conformance scenario that runs `runMigrations` on a Node `createHeadlessEditor` and on the mounted harness editor, then compares the resulting documents with `assertDocEquals`. The existing core test built both editors in Node, where the two factories are the same function, so it could not fail.
