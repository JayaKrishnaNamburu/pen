---
"@input/pen-ai": patch
"@input/pen-assets-memory": patch
"@input/pen-core": patch
"@input/pen-document-ops": patch
"@input/pen-dom": patch
"@input/pen-history": patch
"@input/pen-test": patch
"@input/pen-transport-direct": patch
"@input/pen-transport-sse": patch
"@input/pen-types": patch
---

Fix editor construction failing on non-secure origins and Safari below 15.4.

`crypto.randomUUID` is only exposed in secure contexts, so `createEditor()` and `createHeadlessEditor()` threw a `TypeError` when the page was served over plain HTTP — reaching a dev server from a phone on the same network, for instance. Every ID now comes from `generateId()`, which falls back to `crypto.getRandomValues` for a full-entropy v4 UUID in those environments.
