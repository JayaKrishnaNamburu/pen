# Architecture Invariants

The `I` family is the shared cross-generation invariant set: the durable properties that every other rule family in `spec/rules/` must be derivable from. It governs the single write path, selection authority, headless reachability, read-only observation, facet stability, DOM read/write ordering, normalization, durable position tracking, and instrument integrity. Runtime authority is `@input/pen-core`; `@input/pen-dom` is the only layer permitted to touch browser globals. See `spec/charter/architecture.md` and `spec/charter/mutation-pipeline.md` for the same rules stated as package-level guidance.

## I — Cross-Cutting Invariants

- I1. Every durable document write flows through the commit pipeline and produces exactly one `CommitEvent` carrying exactly one `ChangeSummary`.
- I4. The selection authority's record is the only selection truth. A DOM selection observed outside a gesture window that is not logically equivalent to the record is a defect, and the projector corrects it in the next flush.
- I5. Selection never silently becomes `null` while the document still holds a resolvable position for it. A full document swap through `updateDocument` is the only sanctioned full reset.
- I6. All behavior reachable from a key press is reachable headlessly through a command dispatch with the same result.
- I7. Extension observation is read-only: `observe`, decoration sources, and facet compute functions never mutate the document or selection synchronously. They may dispatch commands or applies asynchronously.
- I8. Facet outputs are referentially stable when their inputs are unchanged; compare functions decide equality.
- I9. During a flush, all DOM reads scheduled by Pen code happen before all DOM writes. Overlay code that measures after writes is a defect.
- I10. Normalization is incremental, idempotent, and bounded. It runs inside the commit's transaction and its effects are part of the same summary.
- I12. Everything outside `@input/pen-dom` works with `createHeadlessEditor()` and no DOM. The modules under `@input/pen-dom` are the only ones allowed to touch browser globals.
- I13. Durable position tracking uses anchors. Library code that retains a raw `{ blockId, offset }` across commits, re-mints anchors per ordinary commit, or re-locates content by fingerprint is a defect.
- I14. No sentinel exists in storage. `isLoneEmptyBlockZwsp` in `packages/core/src/schema/emptyBlockSentinel.ts` — the load-migration detector behind EM3 — is the only production module permitted to name `\u200B`; no other production code tests for the character.
- I15. Instrument-path integrity: every path-shaped datum in a check instrument — allowlist entries, lint-target globs, sink lists, coverage claims, baseline entries — must resolve against the tree. Paths exist, and globs match a non-empty population or state why zero is expected. A deletion or merge that orphans an instrument path fails CI in the same change, not at the next hand audit.

## Retired

Retired IDs stay reserved. Do not reuse `I2`, `I3`, or `I11` to number a new rule or to close a coverage line.

- I2. RETIRED. The mapping-totality invariant — for any commit and valid pre-commit point, mapping returns a valid post-commit point or `null`, never out of range or dangling — went with the position-mapping algebra. It is superseded by AN1–AN7 in `spec/rules/anchors.md`, and the anchor fuzz suite inherited the nightly scale obligation its property suites carried.
- I3. RETIRED. The mapping-composition invariant — composing the summaries of a run of commits and mapping once equals mapping through each summary in order — went with `compose`. Superseded by AN1–AN7.
- I11. RETIRED. The two-seam confinement of the `\u200B` empty-block sentinel was an interim position, not an end state. It is superseded by I14: the character is out of storage rather than confined to known seams.
