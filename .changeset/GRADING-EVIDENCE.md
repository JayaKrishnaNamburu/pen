---
---

# Grading evidence (not a changeset)

Session note only. Empty frontmatter (no package bumps) so `@changesets/parse` accepts the file. A body with no `---` delimiter still fails `pnpm changeset status`: every `.md` in this folder except `README.md` is treated as a changeset. Confirm below that this file does not appear as a package release.

Investigation date: 2026-08-30. Pen checkout: unreleased working tree on top of published **0.1.5** (`9c8436c9`). No grades were changed. No package source was edited.

Published 0.1.5 types were read from Input's install (`@input/pen-types@0.1.5`, `@input/pen-core@0.1.5`). Working-tree types were compiled from source files in this repo.

## Method

Type claims were compiled, not only grepped.

Three consumer files were typechecked with `tsc --strict --noEmit` twice:

1. Against published **0.1.5** declaration files (Input's `node_modules`). Result: **exit 0**.
2. Against this working tree's **source** (`packages/types/src/types/suggestions.ts`, `packages/core/src/facets/coreFacets.ts`, `packages/extensions/ai/src/types/controller.ts`). Result: **exit 2**, three errors:

   - `clipboard-list-consumer`: `Property 'map' does not exist on type 'ClipboardHandler'` (TS2339)
   - `block-suggestion-switch`: `Type '"format-text" | "split-block"' is not assignable to type 'never'` (TS2322)
   - `input-width-assert` (Input's exact `Expect<>` from `penReviewSuggestion.types.test.ts`): `Type 'false' does not satisfy the constraint 'true'` (TS2344)

Those three files compile today against 0.1.5 and fail after this train. That is the existence proof for a breaking consumer. Whether anyone ships that consumer is a separate question (Input, below).

## 1. `admit-html-text-align.md` — graded patch

### Public surface

**No exported type or signature changed.** `sanitizeHTML(html: string): string` is still the function. `ALLOWED_DATA_PEN_ATTRS` is still `[]`.

Behavior inside `packages/extensions/interop/src/html/import/sanitize.ts`:

| Gate                         | 0.1.5                            | this train                                                                                                                    |
| ---------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ALLOWED_INLINE_STYLE_PROPS` | `color`, `background-color`      | plus `text-align`                                                                                                             |
| `text-align` values kept     | (property dropped)               | `left` / `right` / `center` / `justify` / `start` / `end` after trim, case-fold, strip trailing `!important` (not re-emitted) |
| `ALLOWED_ATTR`               | no `align`                       | plus `align`                                                                                                                  |
| `align` values kept          | (attribute dropped)              | `left` / `right` / `center` / `justify`                                                                                       |
| Hostile / unknown values     | n/a (stripped with the property) | dropped (`url(`, `expression(`, comments, escapes, other keywords)                                                            |

SEC3 in `spec/rules/security.md` was amended to name the enums. This is a closed keyword list, not a general CSS widening.

### Who breaks?

A host that **asserted** paste/import cannot produce alignment would see those assertions fail. A host that **relied** on `text-align` / `align` being stripped as a security or product invariant would start ingesting alignment. No compile break exists unless someone typed the allow-list themselves (they cannot: it is not exported).

I could not construct a TypeScript consumer that compiles on 0.1.5 and fails after this change.

Silent behavior change: `parseHtmlWithReport` / HTML paste that previously produced left-aligned blocks from `<p style="text-align:center">` or `<p align="right">` will now keep those keywords for `fromHTML` to map.

### Does Input break?

**Product: no. Tests: three characterization tests go red, on purpose.**

Input gap 4 (`docs/pen-migration/contracts.md` §9) is this exact defect. Alignment is an Input-owned `textAlignment` prop; `fromHTML` already maps `text-align` and `align` the moment they survive sanitize. Input cannot fix this host-side without a second HTML parser.

The three tests that pin the _defect_ (must be inverted on the pin bump, not deleted):

- `packages/email-document/src/schema/__tests__/textAlignment.test.ts` — `"Pen 0.1.5 sanitizeHTML strips text-align and the align attribute"`
- same file — `"parseHtmlWithReport cannot ingest text-align because sanitize runs first"`
- `packages/email-document/src/schema/__tests__/insertEmailClipboardContent.test.ts` — pasted aligned HTML stays left

Input depends on the opposite of stripping. Patch grade matches the surface (behavior-only, additive admission).

## 2. `clipboard-cut-and-importers.md` — graded minor

### Public surface

Exported from `@input/pen-core` (and therefore the starter):

| Symbol                         | 0.1.5 (published `.d.ts`)            | this train (source)                                                                           |
| ------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `ClipboardHandler`             | `type ClipboardHandler = unknown`    | `{ readonly html?: Importer; readonly markdown?: Importer; readonly assets?: AssetProvider }` |
| `clipboardFacet`               | `Facet<unknown, readonly unknown[]>` | `Facet<ClipboardHandler, ClipboardHandler>`                                                   |
| `combine`                      | `(inputs) => inputs` (identity list) | last-wins merge per key; empty output `{}`                                                    |
| `editor.facet(clipboardFacet)` | `readonly unknown[]`                 | `ClipboardHandler` (object)                                                                   |

Related, not a type break:

- `@input/pen`'s `htmlClipboardExtension` stops `assignSlot("paste:importers", { html })` and contributes `clipboardFacet.of({ html: htmlImporter })`. Same HTML importer, different seam.
- `getPasteImporters` (`@input/pen-dom`): 0.1.5 returned `undefined` for an array (so the facet's actual combine output disabled paste). Now it reads the merged table, and still merges a leftover array if one appears.
- `handleCut` and image drop call `undoManager.stopCapturing()` the way paste already did. No type change.

New spec rule **R8** (`spec/rules/facets.md`).

### Who breaks? (concrete consumer)

This compiles on 0.1.5 and **fails to compile** after the change (verified):

```ts
import type { Editor } from "@input/pen-types";
import { clipboardFacet } from "@input/pen-core";

export function readClipboardAsList(editor: Editor) {
  const handlers = editor.facet(clipboardFacet);
  return handlers.map((handler) => handler);
}
```

Same class: `.length`, `handlers[0]`, `for (const h of handlers)`, `Array.isArray` used as the success path.

Runtime, not only types: a host that _already_ called `.map` / iterated the facet value would throw (`map is not a function`) because the value is now `{}` or `{ html?, markdown?, assets? }`.

`clipboardFacet.of` also narrows: 0.1.5 accepted `unknown` (any value). A provider of a non-table is now a type error. Runtime merge already skips non-tables.

Important 0.1.5 inconsistency: the **published type said list**, but `getPasteImporters` **rejected lists**. So the only type-correct read of the facet on 0.1.5 was the read the paste path treated as empty. Hosts that wanted HTML paste used `assignSlot("paste:importers")` or renderer `importers` props — which is what the starter itself did.

A host that never read `editor.facet(clipboardFacet)` and never passed a non-table to `.of` does not compile-break. Cut/drop `stopCapturing` can only change undo grouping (a cut no longer merges with the preceding 400ms of typing). That is the same class of behavior change as the 0.1.5 `patch` precedent, bundled here with the type change.

### Does Input break?

**No.** Repo-wide search of Input source (excluding `docs/` and `node_modules`) finds **zero** `clipboardFacet` or `ClipboardHandler` identifiers. `assignSlot("paste:importers")` is also absent from Input source. Composer paste stays on host DOM listeners (`attachPenComposerClipboard`). Chat rides Pen's default HTML paste and never reads the facet.

Input already calls `stopCapturing()` on composer cut capture. That call is idempotent; it does not break when Pen also calls it. A comment that says Pen does not is the only stale bit.

## 3. `rs7-block-suggestion-width.md` — graded minor

### Public surface

`@input/pen-types` `BlockSuggestion` (`packages/types/src/types/suggestions.ts`):

| Field           | 0.1.5                                                                 | this train                                                                           |
| --------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `action`        | `"insert-block" \| "delete-block" \| "move-block" \| "convert-block"` | plus `"split-block" \| "format-text"` (aliased as exported `BlockSuggestionAction`)  |
| `previousState` | `{ type?, position?, props? }`                                        | plus optional `format?: { from, to, marks, cell? }` (`BlockSuggestionPreviousState`) |

New named exports from `@input/pen-types`: `BlockSuggestionAction`, `BlockSuggestionPreviousState`.

`@input/pen-ai`:

- `PersistentBlockSuggestionAction` is now an alias of `BlockSuggestionAction` (same six members as before at runtime — this was already the wide union on the AI package).
- Re-export `type BlockSuggestion` from `@input/pen-types`.
- Re-export `REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES` (already on `@input/pen-types` in 0.1.5).

`PEN_REVIEW_STYLESHEET` stays on `@input/pen-dom` (API1). Additive re-exports are not the breaking part.

The break is **union widening** on the contract-layer type. Adding optional `previousState.format` is structurally additive (old objects still assign).

### Who breaks? (concrete consumer)

This compiles on 0.1.5 and **fails to compile** after the change (verified):

```ts
import type { BlockSuggestion } from "@input/pen-types";

export function handleBlockSuggestion(suggestion: BlockSuggestion): string {
  switch (suggestion.action) {
    case "insert-block":
      return "insert";
    case "delete-block":
      return "delete";
    case "move-block":
      return "move";
    case "convert-block":
      return "convert";
    default: {
      const _exhaustive: never = suggestion.action;
      return _exhaustive;
    }
  }
}
```

Error after: `Type '"format-text" | "split-block"' is not assignable to type 'never'`.

A host that switches without `never` / without exhaustiveness still compiles and still runs. At runtime those two actions already existed on `PersistentBlockSuggestion` / `readAllSuggestions` in 0.1.5 — the contract type was lying. Widening **fixes** a missed-case hole; it only punishes hosts that already treated the four-member union as closed.

I could not find a runtime-silent behavior change here. The runtime review item did not shrink or grow.

### Does Input break?

**Product runtime: no. Type-check: one test file, not product code.**

Input types review items as `PersistentSuggestion` from `@input/pen-ai` (`PenReviewSuggestion`). It does **not** switch on `BlockSuggestion["action"]` in product code. `REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES` is already imported from `@input/pen-types` (`apps/web/src/features/editor/pen/review/index.ts`); the new `@input/pen-ai` re-export is unused-but-harmless.

The one compile failure is `apps/web/src/features/editor/pen/review/types/penReviewSuggestion.types.test.ts`, which asserts

`Exclude<PersistentBlockSuggestion["action"], BlockSuggestion["action"]>` is exactly `"split-block" | "format-text"`.

That `Expect<>` is the same fixture compiled above (TS2344). On the pin bump it must be inverted to `never` (becoming the host-side RS7 pin). The comment on `penReview.types.ts` that the contract type still omits those two actions goes stale at the same time.

Input must not retype review items down to `BlockSuggestion` — the runtime item still has `kind` and `blockId`.

## Input (the only real consumer) — verdict

Pins are **exact** `0.1.5` (no `^`) in `apps/web`, `apps/api`, and `packages/email-document`. Neither 0.1.6 nor 0.2.0 auto-installs. Adoption is always a bump PR.

| Changeset                     | Product compile   | Product runtime                                      | What Input must do on bump                                       |
| ----------------------------- | ----------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| `admit-html-text-align`       | clean             | wanted fix                                           | invert three characterization tests                              |
| `clipboard-cut-and-importers` | clean             | no facet read; cut `stopCapturing` already host-side | optional: drop redundant host `stopCapturing` / fix the comment  |
| `rs7-block-suggestion-width`  | **one test file** | review already uses `PersistentSuggestion`           | invert `penReviewSuggestion.types.test.ts`; delete stale comment |

**Input does not break on any of the three in production code.** The blocking is "this train is not published yet", not "the grades will force Input rewrites".

## `0.1.6` vs `0.2.0` for a caret range

npm / node-semver: `^0.1.5` means `>=0.1.5 <0.2.0`. It does **not** include `0.2.0`. `^0.2.0` means `>=0.2.0 <0.3.0`.

| Choice                                   | What `^0.1.5` does                                                                                                                                            | What an exact pin (Input) does                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Regrade both minors to patch → **0.1.6** | Auto-upgrades into the clipboard return-type change and the widened `BlockSuggestion` union. `tsc` fails for the two consumers above without a lockfile bump. | Nothing until someone edits the pin. Same bump PR as 0.2.0. |
| Stand the minors → **0.2.0**             | Stays on 0.1.5. Host opts in, sees a minor bump, reads the changelog.                                                                                         | Same: nothing until the pin PR.                             |

So the owner's worry that "a patch segment would mislead other consumers" is true, and the practical form of that misleading is worse than a label: **patch is the choice that silently delivers the type breaks to caret users**. `0.2.0` is the choice that _protects_ them.

Input is unaffected by that axis. It never uses caret ranges on `@input/pen*`.

### Is `behavior-only` vs `type-changing` the right axis for the 9e83fed1 precedent?

Precedent commit `9e83fed1` regraded three **behavior** changes to `patch` so the train stayed on 0.1.5:

- clipboard JSON payload grew embed inserts (IOP7/IOP8) — no exported type removed
- vertical caret outcome became `BlockSelection` — same function, different runtime value
- schema registration now **throws** for a reserved `type` prop — still a behavior/throw, not a changed published type

Those could not be demonstrated with a `tsc` failure of the kind compiled here. A host found out at runtime or at schema build.

This train's two minors **can**: `editor.facet(clipboardFacet)` is a different TypeScript type; `BlockSuggestion["action"]` is a different union. That is the honest difference from the precedent.

Caveats if you still want to apply the precedent:

- Union _widening_ is a compile break only for exhaustive switches. Many libraries still ship that as patch. Runtime did not change.
- The clipboard facet type on 0.1.5 was already a lie relative to the paste reader. Changing the type to match merge behavior is a fix of a defect that also happens to break the listed consumer.
- "Type-changing ⇒ must be minor" is the right axis for **honesty of the segment**. It is not the right axis for **does Input break** (it does not).

## Gap 9 — late keybinding installation

`spec/rules/facets.md` intro (present since the spec rewrite `ad5c93ba`, 2026-08-26; this working tree only retouched "clipboard handlers" → "clipboard importer tables"):

> Extensions contribute through the `facets` array on the extension object; extensions are fixed at editor creation, so there are no compartments and no runtime reconfiguration.

R2 freezes **static** facet providers at creation. Computed providers may still recompute when document/selection deps change. The ban is on **adding providers / extensions after `createEditor`**, not on "keymaps can never change."

Code:

- `ExtensionManagerImpl.register` / `unregister` exist, including a dependency check on unregister.
- `Editor` only calls `register` in the constructor loop. `unregister` has **no production caller**.
- Public `Editor` / `EditorInternals` do not expose the manager.

Input (`contracts.md` gap 9) already works around this with DOM listeners for composer keys, and with `extraExtensions` at `createEmailPenDocument` construction for AI/review (the case a DOM listener cannot cover).

### Honest read

**Closer to documented shipped design than to an unexamined accident — but thin.**

Evidence it is deliberate:

- The sentence names CodeMirror **compartments** and declines them. That is a known alternative, not a comment that grew from a bug report.
- It has been spec law since the facets spec was written (2026-08-26), not added in this unreleased round.
- R2's "static facets resolved once" is the same stance.

Evidence it is a retrofit / leftover:

- `unregister` is fully implemented and unused. That is "we built late install and then did not publish it," not "the runtime cannot do it."
- There is no spec paragraph explaining _why_ late install is refused (lifecycle, facet graph, undo, SSR). One sentence plus "no compartments."
- Input's Wave 3 `extraExtensions` hole shows the constraint is already being paid around, including for non-keymap extensions.

It is not a bug to slip in beside these three changesets. Reversing it is a design change: public late `register` (or a documented computed-keymap-over-host-refs pattern) versus keeping DOM capture for host keys. The computed-facet path can already express document/selection-dependent bindings if registered at construction; it cannot express React-only state without a closure over mutable host state, which Input declined to thread through the document factory.

## Outcome — owner decided `0.1.6` (2026-08-30)

**Both `minor` grades were re-graded to `patch`. The train is `0.1.6`.** That is the disagreement anticipated in point 4 below, taken deliberately: there are no caret consumers yet, Input is the only consumer and pins exact versions, and the owner would rather keep the 0.1.x line than make `0.2.0` the first breaking train. Nothing in the evidence below contradicts that — it is a positioning call, and the evidence's own point 4 says so.

Both were re-graded together, which was the one mechanical requirement (the `fixed` group takes the highest bump, so a surviving `minor` would still have produced `0.2.0`). Verified: `changeset status` lists all 23 packages under `patch`, none under `minor`. The `rs7` changeset body was also edited — it asserted its own `minor` grade, which would have shipped a published changelog entry contradicting its version. The consumer-actionable fact (an exhaustive `switch` over the old four-member union must handle the two new members) was kept.

One thing this outcome does **not** settle: `spec/rules/api.md` API7 and `AGENTS.md` both state "breaking is `minor`, additive is `patch`", and `changeset-check` only rejects `major` — it does not police minor-vs-patch. So this is a deliberate divergence from a normative rule that no gate will catch, and it is the fourth train in a row to diverge the same way (`0.1.3`, `0.1.4`, `0.1.5`). Per AGENTS.md ("when implementation proves a rule wrong, amend the spec in the same PR"), API7's flat rule is what should change — most honestly as an explicit `0.x` carve-out for a train with no caret consumers — if the fifth train goes this way too.

## Recommendation as written before that decision (superseded)

**Stand the two `minor` grades. Publish `0.2.0`. Leave `admit-html-text-align` as `patch`.**

Reasoning you can reject:

1. Two compile-proven public-type breaks exist. The 9e83fed1 precedent was for changes that did not fail `tsc`. Using it here would make the next `^0.1.5` upgrade the first time a caret consumer's build goes red without a minor bump.
2. Input is exact-pinned. **0.1.6 and 0.2.0 are the same adoption cost** — one pin PR, invert the tests listed above. The version number does not unblock Input faster.
3. The clipboard change is the sharper break (list → object is a runtime `TypeError` if anyone iterates). The `BlockSuggestion` widen is the milder one (exhaustive `never` only; runtime already had six actions). Grouping them under one `0.2.0` is consistent with the fixed release group.
4. If you disagree, the knowledgeable disagreement is: "there are no caret consumers, Input is the world, union widening is additive, and I would rather keep the 0.1.x line than teach 0.2.0 as the first breaking train." That is a product/positioning call, not a fact this evidence contradicts. If you take it, regrade **both** minors together so the train does not still jump to 0.2.0 on the remaining one.

Do not regrade only one of the two minors. The fixed group takes the highest bump.
)
