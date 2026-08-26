# Facet Rules

Facets are the single typed primitive for every "many extensions contribute values, one consumer combines them" seam: keymaps, before-apply hooks, decoration sources, input rules, command handlers, clipboard handlers, block direction, and the single-value controller seams. The `R` family governs provider ordering, recomputation, and reads; the `SM` family governs what replaced the v1 untyped slot mechanism. Contracts live in `@input/pen-types` (`packages/types/src/types/facets.ts`), and the registry, resolution, and core-defined facets in `@input/pen-core` (`packages/core/src/facets/`), read through `editor.facet(facet)`. Extensions contribute through the `facets` array on the extension object; extensions are fixed at editor creation, so there are no compartments and no runtime reconfiguration.

The letter `R` names two unrelated families. `R1`–`R7` in this document are facet provider and combine rules. `R1`–`R3` in `spec/rules/selection.md` are reader gesture-window admissibility rules. Neither family was renamed, so a bare `R` reference is only meaningful with its document.

## R — Facet resolution

- R1. Providers for a facet are ordered by precedence bucket (`highest`, `high`, `default`, `low`, `lowest`), then by extension topological order from the existing dependency sort, then by index within the extension's `facets` array, and `combine` receives inputs in exactly that order. First in the array is highest priority by convention; a facet whose consumers want last-wins implements that in its own `combine`.
- R2. Static facets are resolved once at editor creation and frozen. Registering a computed provider for a static facet throws at creation time, as a configuration error that fails fast.
- R3. A computed provider is recomputed when a facet dependency's output changes under `compareOutput`, when `"document"` is a dependency and a non-empty commit lands, or when `"selection"` is a dependency and the selection record version changes. Recomputation is synchronous and runs in the commit pipeline's `settle-facets` phase, after `map-selection` and before `emit` (`spec/rules/pipeline.md`), so `CommitEvent` consumers observe settled facet values.
- R4. If a recomputed input compares equal under `compareInput`, `combine` is skipped for that change; if the combined output compares equal under `compareOutput`, the previous output object is kept rather than replaced, which is what makes facet outputs referentially stable (I8).
- R5. Dependency cycles between computed facets are a creation-time error, detected by a topological check over the declared dependencies.
- R6. Compute functions are pure reads (I7): they may read the editor, document, selection, and other facets, and must not `apply`, write selection, or touch the DOM. The mechanical half of this is a lint gate banning `@input/pen-dom` imports from facet compute call sites; the rest is a documented contract, not an enforced one.
- R7. Reading a facet before editor creation completes throws. Reading an unregistered facet returns `combine([])`, the facet's empty output, so optional integrations do not need existence checks.

## SM — Seam migration

- SM2. The public accessor helpers keep their documented names and become facet reads internally — `getSearchController(editor)`, `getAutocompleteController(editor)`, `getMultiplayerController(editor)`, `getHistoryController(editor)` and their siblings resolve the corresponding single-value controller facet. Host code written against the documented helpers does not break when a seam moves.

A single-value controller facet is `defineFacet` with `static: true` and a `combine` that takes the first input and otherwise yields `null`, so the highest-precedence provider wins and extra providers are reported as a diagnostic rather than silently merged.

## Retired

Retired IDs stay reserved. Do not reuse `SM1` or `SM3` to number a new rule or to close a coverage line, and do not add a test named for either: there is no adapter and no slot lint left to fail.

- SM1. RETIRED (2026-08-25). `getSlot` and `setSlot` existed as in-train adapters that resolved the mapped facet and emitted a deprecation diagnostic on write. The adapter module and both accessors are deleted along with the mechanism they wrapped, so the rule has no subject; there was no deprecation window, per API7. The remaining slot key constants in `packages/types/src/constants/slots.ts` are reached through `editor.internals.assignSlot` and are migration residue, not a supported second contribution seam.
- SM3. RETIRED (2026-08-25). The rule required every new controller seam after the facet migration to be a facet and made a new string slot key a lint error under a `no-new-slots` gate. Its enforcement was deleted by design together with the slot mechanism, on the grounds that a gate policing a deleted mechanism is scaffolding squared; the standing obligation now lives in the mechanism's absence, checked by asserting that `getSlot` and `setSlot` appear nowhere in `packages`. New controller seams are facets because facets are the only contribution channel that exists.
