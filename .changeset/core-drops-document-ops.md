---
"@input/pen-core": major
---

`createEditor()` no longer registers `documentOpsExtension()` by default. Core's fallback extension list is now `[undoExtension()]`, and `@input/pen-core` no longer depends on `@input/pen-document-ops`.

Hosts that relied on the default — including anything using `aiExtension()`, which declares `document-ops` as a hard dependency — must either use `@input/pen-preset-default` (which registers it) or pass `documentOpsExtension()` explicitly:

```ts
createEditor({ schema, extensions: [documentOpsExtension(), aiExtension()] });
```

This removes the last dependency-graph inversion that was breaking the build: `document-ops` legitimately depends on core, so core depending on it back formed a cycle as soon as `document-ops` took a test-only dependency on `@input/pen-test`.
