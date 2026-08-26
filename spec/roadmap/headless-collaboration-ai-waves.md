# Headless Collaboration And AI Primitives Roadmap

## Status

Most of this roadmap has shipped and moved into the package specs. What remains is the short list under [Remaining Gaps](#remaining-gaps); everything else is recorded here only so the boundary that produced it stays legible.

This document is the one intentionally forward-looking file in `spec/`. The rest of the tree is current-state and package-centric.

## Product Boundary

Pen must remain a headless, MIT-licensed editor library.

Pen provides generic primitives for CRDT documents, collaboration state, structured mutation origins, grouped undo/update semantics, headless server editor construction, app-owned extension roots, export hooks, field adapters, and deterministic fixtures.

Pen must not provide product-specific semantics for email, recipients, subject lines, send/provider workflows, host-specific sync tables, app auth, app model routing, system prompts, or external provider secrets. Host apps own those product concerns.

The generic framing is the point: a host can build these locally, but the same primitives serve any app building collaborative documents, AI-assisted editing, CMS workflows, comments, notes, or issue descriptions. Improving Pen generically beats adding host-shaped APIs such as `toMail`.

## Cross-Wave Invariants

- `editor.apply(...)` remains the canonical document mutation path.
- Pen never owns host auth, persistence policy, transport secrets, or product workflow state.
- Renderer packages do not become document sources of truth.
- CRDT/Yjs helpers stay in `@input/pen-crdt-yjs` unless they become implementation-agnostic contracts.
- Export packages emit fragments and artifacts; host apps own final wrappers, sanitization policy, and delivery.
- AI helpers remain model and provider agnostic.
- All new APIs must work in headless and server environments.

## Shipped

These waves are done. The package specs are the current-state description; this list exists so the roadmap is not read as outstanding work.

- **CRDT state vectors and synchronization barriers.** `encodeYjsStateVector()`, the base64 encode/decode pair, `compareYjsStateVectors()`, and the `isYjsStateVectorSatisfied()` / `isYjsStateVectorBase64Satisfied()` predicates ship on `@input/pen-crdt-yjs`. See `spec/packages/crdt/yjs.md`.
- **Headless editor factory and extension roots.** `createHeadlessEditor()` on `@input/pen-core`; `ensureExtensionRoot()` and `readExtensionRoot()` on `@input/pen-crdt-yjs`. See `spec/packages/core.md`.
- **CRDT field adapters.** `createYTextFieldAdapter()` and `createYArrayFieldAdapter()`. See `spec/packages/crdt/yjs.md`.
- **Deterministic fixtures and contract tests.** The fixture and contract helpers ship on `@input/pen-test`. See `spec/packages/tooling/test.md`.
- **Structured mutation origins** (the origin half of the origins-and-groups wave). Structured `OpOrigin`, `ApplyOptions.groupId`, and `MutationGroupMetadata` ship on `@input/pen-types`, and `@input/pen-undo` groups by `groupId`. The shipped `OpOriginType` union is wider than this roadmap proposed.
- **Plain-text export** (the artifact half of the export wave). `exportPlainText()` and `textExporter` ship on `@input/pen-interop`.

## Remaining Gaps

Four items from the original waves did not ship. Each is listed with what exists instead, so the gap is a decision rather than an oversight.

- **No `editor.applyGrouped()`.** Grouping is expressed as `editor.apply(ops, { origin, groupId })`. A dedicated method was never added; if one is wanted it is sugar over the existing option, not a second write path.
- **No origin-type filtering or grouping on history.** `@input/pen-history` exposes snapshots and attribution but has no API for filtering or grouping a history view by origin type.
- **No `ExportHooks` or `target` on `ExportOptions`.** `ExportOptions` carries flags only: `includeApps`, `includeLayout`, `includeMetadata`, `includeSuggestions`, `prettyPrint`, and `extra`. There is no hook surface for host-supplied export transforms.
- **No `SuggestionExportMode` enum.** Suggestion export is the boolean `includeSuggestions`, which the HTML and Markdown exporters read as raw versus resolved. A named mode was never introduced.

A fifth item is worth recording as a deliberate non-outcome: the proposed `packages/extensions/export-text` package was never created, because plain-text export landed on `@input/pen-interop` instead. That is the better home and the package should not be revived.
