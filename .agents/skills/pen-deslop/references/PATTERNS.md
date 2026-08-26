# Patterns

Short rules for detecting and removing AI-generated slop in Pen. Add patterns here, not in `SKILL.md`.

Use this shape:

```text
## Rule name
Signal: one short detection heuristic.
Fix: one short remediation heuristic.
```

## Pipeline bypass

Signal: code writes `Y.Text`/`Y.Map` directly, calls `adapter.transact`, or mutates document state outside `editor.apply` / the sanctioned stream writer.
Fix: express the change as `DocumentOp[]` through `editor.apply(ops, { origin })`, or use `TextStreamWriter` for high-frequency writes (`spec/rules/pipeline.md`).

## Selection timer hack

Signal: `requestAnimationFrame`, `setTimeout`, retry counters, suppression booleans, or intent epochs added to selection, projection, or focus code to "make it stick".
Fix: remove; selection writes are versioned through the authority and projected once per flush (`spec/rules/selection.md` S4). If the bug seems to need a timer, the bug is elsewhere — investigate instead.

## Guard-flag accretion

Signal: a new boolean flag (`_suppressNext…`, `_isApplying…`, `_pendingSync…`) coordinates two code paths that race, joining several existing flags.
Fix: replace flag choreography with a version/epoch comparison on one owned record, or route both paths through the single owner of that state.

## Sentinel leakage

Signal: new code tests for `\u200B` / `ZERO_WIDTH_SPACE` outside the two sanctioned seams (summary builder, `offsetDomain`).
Fix: use the logical offset domain helpers; if a case seems to need sentinel knowledge, the offset translation is being done at the wrong layer.

## Op union sprawl

Signal: a new `DocumentOp` variant for something expressible by composing existing ops, or for behavior that belongs in a command handler.
Fix: compose existing ops in a command (`spec/rules/commands.md`); reserve new op types for genuinely new document effects.

## Slot revival

Signal: a new string-keyed slot, service locator, or `getSlot`/`setSlot` call for wiring extensions together.
Fix: use a typed facet with explicit precedence (`spec/rules/facets.md`); single-controller seams use the `singleController` combine.

## Extension throw

Signal: extension hooks (`observe`, decorations, input rules, tool handlers) throw on malformed input or unexpected state.
Fix: drop the input with a `diagnostic` event and degrade gracefully (`.cursor/rules/pen-extension-resilience.mdc`); editor sessions must survive misbehaving extensions.

## Defensive DOM swallow

Signal: `try/catch` around DOM selection/range/geometry APIs that silently swallows, added "because Safari".
Fix: if the failure is real, name the quirk in a comment with the exact condition and emit a diagnostic; if it is not reproducible, delete the guard.

## Generic robustness theater

Signal: fallbacks, guards, retries, options, or null handling appear without a local failure mode, caller need, or testable invariant.
Fix: remove the fake robustness or replace it with the narrow invariant the local system actually needs.

## Plausible helper drift

Signal: a new helper wraps simple logic, duplicates a nearby utility, or names a concept more generically than the surrounding code (`processContent`, `handleUpdate`).
Fix: inline it, reuse the canonical helper, or rename/move it to match the owning local concept (Pen has exact vocabulary: commit, splice, projection, facet, origin — use it).

## Renderer logic smuggle

Signal: behavior (offset math, clipboard parsing, selection logic, scheduling) implemented inside `rendering/react` or `rendering/vue` instead of `rendering/dom` or core.
Fix: move behavior to pen-dom (or core when DOM-free); renderer packages hold bindings only (`spec/rules/api.md` API6).

## Decorative comments

Signal: comments narrate obvious code, market the implementation, or explain intent that should be visible in names/types/tests.
Fix: delete the comment or replace it with a short lowercase note about a non-obvious invariant.

## Optionality fog

Signal: optional params, nullable fields, `unknown`, `any`, casts, or broad unions appear to make code compile without clarifying the real contract.
Fix: make the boundary explicit and push optionality to the one place where absence is real.

## Pattern cargo cult

Signal: code copies a pattern mechanically (builder, registry, adapter) even though the local use case has one caller and no variation.
Fix: collapse to the direct local shape until variation exists.

## Unused shared symbol export

Signal: exported types, constants, or helpers introduced for one caller, speculative reuse, or a single local use where inline code would be clearer.
Fix: keep single-use symbols private or inline; export only when a second real consumer exists. Public exports are API surface (`spec/rules/api.md` API4).

## Utility file confetti

Signal: a one-function utils/types/constants file is created even though sibling logic belongs to the same domain bucket.
Fix: group related declarations in the nearest domain file unless the model is genuinely separate.

## Symbol file impurity

Signal: type files export values, constants files export behavior, or the types package gains runtime logic.
Fix: keep type files type-only and constants files constant-only; runtime logic lives with its domain owner (`spec/rules/api.md` API3).

## Alias export indirection

Signal: pass-through aliases (`export const a = b`), re-exports that only rename, or duplicate slot/constant aliases.
Fix: import and export the canonical symbol from its owning module; rename at the source if the name is wrong.
