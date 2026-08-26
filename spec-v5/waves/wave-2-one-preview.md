# Wave 2: One Preview

Depends on: wave 1. Blocks: wave 3.
Packages touched: `@input/pen-ai` (presentation paths), `@input/pen-dom` (the exported review stylesheet), `playground/`, binding styling docs (`packages/rendering/react/STYLING.md`, `packages/rendering/vue/STYLING.md`).

Discharges RS1–RS6. The four edit-preview mechanisms collapse onto the review surface; the visible stream and the autocomplete ghost are explicitly kept (`02-review-surface.md` §2). The generate-lane buffered markdown preview migrates to streaming preview blocks, which unblocks wave 3's planner deletion (the generation-execution path stops consuming the planner's preview parsing). The styling contract ships from one module with CSS custom properties as the theme seam.

Order of PRs (WA11): the migrations land against the existing review surface first; the bespoke presentation stacks and the `markdown-fast-apply` plan helpers are deleted immediately after, in the same wave.

## Entry Gate

- GATE 2.1 [grep]: `rg -l "pen-fast-apply" packages playground examples`
  expect: exit 0 with exactly one path — `packages/extensions/ai/src/__tests__/agentChat.editChannel.test.ts`, the negative test that feeds the old XML in and asserts the document does not change. No parser, prompt, or doc may match. (Amended 2026-08-26 to match wave 1's GATE 1.4, which was itself amended when the teardown shipped. The original `exit 1` could only be satisfied by deleting that test, and a test asserting the tag is inert is the opposite of a violation — it is the UC2 guard. Wave 1 held; this gate now says so correctly.)
- GATE 2.2 [test]: `pnpm --filter @input/pen-ai test`
  expect: exit 0 — green before the presentation migration starts.

## 1. The Migrations

Selection rewrites in suggestions mode stage through the suggest-mode interceptor and render as review-surface suggestions; the bespoke selection-rewrite decoration stack is deleted. Block generation renders streaming preview blocks in flight and stages on completion; the buffered markdown preview renderer and its plumbing in the generation-execution path are deleted, together with the `markdown-fast-apply` plan helpers this wave strands.

**A fourth surface joined the deletion list on 2026-08-26, already producer-less.** Closing UC3's text-parsed door (`../01-channel.md`, UC3 shipped correction) removed the only reachable producer of the structured-preview state. Its last remaining producer is `onStructuredData` in `controller/generationExecutionLoop.ts`, gated on `useStructuredIntentTransport`, and `__tests__/uc3.planReachability.test.ts` proves that flag can never be true: every registered block adapter carries `transportKind: "flow-text"` and adapter resolution cannot yield anything else. So this wave deletes the surface outright rather than migrating it — `Pen.AI.Progress`'s `data-structured-preview-*` attributes, `primitives/ai/structuredTargetPreview.tsx`, `hooks/useAIStructuredPreview.ts`, `utils/structuredPreview.ts`, the preview-patch and preview-equality helpers, and the `structuredPreview` field on session/generation state. The React test that covered it (`aiPrimitives.25.test.tsx`, 359 lines) is already deleted. Wave-2 rule: no PR in this wave may add a producer to keep this surface alive.

**Shipped 2026-08-26; GATE 2.12 green.** Deleted `runtime/structuredPreview.ts` and `utils/structuredPreview.ts` — a 380-line patch producer and a 374-line patch consumer, two hand-rolled JSON Patch implementations kept in sync for a channel that emitted nothing — plus `hooks/useAIStructuredPreview.ts`, `primitives/ai/structuredTargetPreview.tsx`, the `GenerationStructuredPreviewState` / `StructuredPreviewPatchOperation` types, the `structured-preview` stream event, the `structuredPreview` field on generation and session-turn state, `onStructuredData`, and the transport flag. The always-empty `targets` half of the review-artifact builder went with them: `serializeStructuredPreviewTargets` returned `[]` unconditionally, so `buildStructuralPreviewArtifacts` collapsed into `buildStructuralReviewItems`. Two host-readable attributes that only the dead preview could set also went: `data-review-preview-active` on `Pen.AI.ChangeList`, and the playground `ReviewSurface`'s streaming branch. The api-docs ratchet tightened 1775 → 1761.

**Both migrations shipped 2026-08-26; GATE 2.3, GATE 2.4, and GATE 2.5 green.** Markdown block generation and selection rewrites now preview as streaming review text and stage on close. Three call sites of `_refreshStreamingMarkdownBlockPreview` went — one in `generationExecutionLoop.ts` and two in `localOperationExecution.ts` — and the function with them, along with the `streamedMarkdownSuggestionIds` / `lastStreamedMarkdownPreviewText` execution-state fields and the local lane's equivalent pair. The three preview call sites now build their input through one module, `controller/streamingPreviewInput.ts`, which owns the preview text (normalize, then flatten) and the target region.

Two things the wave doc had wrong, corrected here rather than silently (WA1):

The selection lane's "bespoke decoration stack" was narrower than RS2 describes. Staging already went through the suggest transform and staged suggestions already rendered through `collectSuggestionDecorations` — that _is_ the review surface. What was actually bespoke was the in-flight posture on the path that cannot stream an incremental splice (a selection spanning blocks, or a markdown rewrite): it borrowed the inline-completion ghost to preview a document edit, a job RS1 assigns to the review surface. So the selection migration is a posture change, not a presentation rewrite, and nothing in `review/` was deleted for it. That path also had no test at all — the only assertion touching the ghost asserted it was absent on the other path — which is why GATE 2.3 is new coverage rather than a rewritten test.

The block-generation deletion could not land alone. `generationExecutionFinalize.ts` gated the buffered block commit on `!canStreamMarkdownBlockSuggestions`, because the per-delta preview had already staged the payload by the time the turn closed. Deleting the preview refresh without moving the commit would have left that lane committing nothing at all, so the subtraction and the commit move are one change. This is the exception WA11 allows and the reason the gate pairs them.

The behavior change is observable, so two tests that encoded the old posture were updated rather than deleted: `extension.part9.test.ts` (mid-stream document text became a mid-stream preview) and `pen-react`'s `aiPrimitives.01.test.tsx` (a mid-stream `h1` schema block became mid-stream preview text, with the heading asserted after the edit stages). Both keep their end-state assertions unchanged — what accept writes did not move.

GATE 2.5's live population was only the per-delta refresh. `MARKDOWN_FAST_APPLY_OMISSION_MARKER` was already gone before the wave opened: commit `ad5c93ba` removed it from `runtime/flowMarkdown.ts` with the `<pen-fast-apply>` scaffolding during UC1's teardown. `RS5`'s citation of `runtime/flowMarkdown.ts:16` is stale and is corrected in `../02-review-surface.md`.

Removing the flag has one consequence wave 3 inherits. In `controller/generationExecutionFinalize.ts` the flag also gated `structuredIntentResolution`, so `resolvedStructuredPlan` was always null; the generate lane now writes `plan: null` and `reviewItems: []` explicitly. That leaves `buildDocumentMutationPlanExecution`, `_commitStructuredPlan`, and `buildStructuralReviewItems` with no caller on the finalize path. Wave 3's UC3 step 2/3 therefore finds the plan executor **stranded rather than live**, which makes its deletion smaller, not different. The `plan` / `reviewItems` / `structuredIntent` fields themselves are deliberately left in place for wave 3 to remove with the executor.

- GATE 2.3 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/rs2.selectionRewrite.test.ts`
  expect: exit 0 — RS2 claimed for the selection lane: rewrite stages through the interceptor and renders review decorations; the deleted stack's decoration classes appear nowhere in the render.
- GATE 2.4 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/rs2.blockGeneration.test.ts`
  expect: exit 0 — RS2 claimed for the generate lane: block generation previews as streaming preview blocks, then stages.
- GATE 2.5 [grep]: `rg -n "MARKDOWN_FAST_APPLY_OMISSION_MARKER|_refreshStreamingMarkdownBlockPreview" packages --type ts`
  expect: exit 1 — the omission marker and the per-delta preview refresh are gone (RS5); preview payloads carry no channel-control tokens.

  Amended 2026-08-26. The original population was the string `markdown-fast-apply`, expected empty. Measuring the call graph before deleting showed that expectation is false, in the same way wave 1's GATE 1.6 amendment already recorded: the two surviving matches are the telemetry surfaces `ai-markdown-fast-apply-verify` and `ai-markdown-fast-apply` in `controller/fastApplySupportMethods.ts`, and they belong to `_verifyMarkdownFastApplyResult` / `_buildMarkdownScopedReplacementOps`, which are reached only from `controller/bufferedBlockGenerationMethods.ts` — **not** from the preview refresh. `_commitBufferedBlockGeneration` is the generate lane's _commit_ path (four callers in `operationCommitMethods.ts`, one in `generationExecutionFinalize.ts`), so it and its markdown verification survive this wave and are renamed in wave 3 under UC5. What wave 2 strands is the per-delta refresh — `_refreshStreamingMarkdownBlockPreview`, called from `generationExecutionLoop.ts` and twice from `localOperationExecution.ts`, which re-commits the whole block on every token — so that is what this gate now names. Deleting the commit path to satisfy a string match would have removed the generate lane, not a preview.

## 2. Posture and Inventory

- GATE 2.6 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/rs1.surfaceInventory.test.ts`
  expect: exit 0 — RS1 claimed: driving each lane headlessly yields only the three surfaces; an unknown decoration type fails the test.
- GATE 2.7 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/rs3.postureTotality.test.ts`
  expect: exit 0 — RS3 claimed: every reviewable state renders a defined posture, and a session ending with unapplied edits reports them for a non-loop lane.

**Both shipped 2026-08-26; GATE 2.6 and GATE 2.7 green.** RS1's inventory drives the staged and mid-flight selection lanes and markdown block generation, collects every class the resulting decorations carry, and fails on a token the vocabulary does not declare. It observes eleven distinct classes across the lanes and refuses to pass on an empty set, because a closed-set check over nothing proves nothing. It imports the vocabulary RS4 exports rather than restating it, so the inventory cannot drift from what the producers emit. Withholding one class from the vocabulary was confirmed to fail three of its assertions before the vocabulary was restored.

RS3 splits into a resolver claim and a reporting claim, and only the first is fully met.

Posture totality is claimed by a pinned mapping table (session × generation × suggestions → posture) plus a lifecycle pass showing in-flight renders preview text, awaiting-review renders staged decorations, and accept leaves no review decoration behind. The resolver's return union does not include `"thinking"`; that token belongs to generation/session status, not review posture.

The reporting claim is weaker than this gate assumed, and the reason is a deletion this wave's own predecessor made. The unapplied-edit report (`isUnappliedEdit` in `controller/generationExecutionFinalize.ts`, emitting `GENERATION_EDIT_NOT_APPLIED`) fires only when `applyStrategy` is `markdown-full-replace` and the turn reaches `complete` with a `noop` receipt. Its changeset (`.changeset/report-unapplied-ai-edits.md`) names the state it was built for: "a plan that fails to compile — or that names blocks the document does not have". Wave 2a deleted that plan machinery. Driving the lane every way available — the target block deleted mid-stream, markdown that parses to no blocks — never reaches `complete` + `noop`: the vanished target reports `cancelled`, and unparseable markdown reports `applied`. So the guard now watches for a state whose producer is gone, and the test claims what is actually verifiable: the turn produces text, stages nothing, writes nothing, and does **not** report success. That is RS3's floor rather than its ceiling.

Two lanes that can end with nothing landing are uncovered, and neither is safe to widen inside wave 2. A `tool-loop` turn reaches `complete` with a `noop` receipt and non-empty text — measured, not inferred — but on that lane text without an edit is usually a chat answer rather than a lost edit, so reporting it as an error would be wrong; distinguishing the two means asking whether an edit tool was called, which is the loop boundary wave 3 owns (UC6–UC8). The requested-operation path (`controller/localOperationExecutionFinalize.ts`) can reach a `noop` commit and never consults the report at all, but its operations are resolved internally from a session and prompt rather than passed in, so there is no host-drivable case to claim yet. RS3's "every lane that can propose an edit" is therefore **carried into wave 3** rather than closed here.

## 3. The Styling Contract

`@input/pen-dom` exports one review stylesheet and one class vocabulary; the four constant sites collapse onto it; hosts theme via CSS custom properties. The playground drops its hand-rolled review rules; both STYLING docs point at the exported contract.

- GATE 2.8 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/rs4.stylingContract.test.ts`
  expect: exit 0 — RS4 claimed: all review decoration class names resolve from the single exported vocabulary.
- GATE 2.9 [grep]: `rg -n "pen-suggestion-insert|pen-suggestion-delete|pen-ai-review-preview" playground/src/editor/editor.css`
  expect: exit 1 — the playground no longer re-implements the review rule blocks it hand-writes today; it imports the sheet and sets custom properties. (Note the seam this wave closes: the review constants in `reviewPresentationStyles.ts` are inline-style arrays, not classes — RS4 replaces inline styling with the exported class vocabulary so hosts can theme at all.)

**Shipped 2026-08-26; GATE 2.8 and GATE 2.9 green.** `reviewPresentationStyles.ts` is deleted, `PEN_REVIEW_STYLESHEET` ships from `@input/pen-dom`, and the playground sets four custom properties where it used to keep three rule blocks. The parenthetical above understated the seam: the inline styles were not merely "not classes", they were **inert**. `applyElementAttributes` refuses `style` outright (`packages/rendering/dom/src/__tests__/reconcilerMarks.test.ts` "SEC2: style cssText refused"), so every `--pen-ai-review-*` property Pen wrote was dropped before it reached the DOM. `packages/rendering/react/STYLING.md` had already recorded this — its review token table carried a standing warning that setting any of them "has no effect today". RS4 is what makes those properties work, not merely relocate.

Three corrections to this section, recorded rather than silently absorbed (WA1):

The sheet cannot ship from `@input/pen-dom` as a `.css` file, which is how "exports one review stylesheet" reads. API7 puts `sideEffects: false` on every published package, which entitles a bundler to drop a bare `import "@input/pen-dom/review.css"`, and API4 would need a new export key plus an allowlist entry to publish the path at all. A stylesheet a bundler may discard is not a contract, so it ships as an exported string that hosts adopt deliberately. The playground adopts it in `main.tsx`.

The vocabulary cannot live in `@input/pen-dom` either, because `@input/pen-ai` emits most of these classes and the two packages are siblings — neither depends on the other, and pointing a headless extension at the DOM package to read class names would invert the layering. It lives in `@input/pen-types` (`constants/reviewSurface.ts`), which API3 permits explicitly: "type declarations, frozen constants, and pure type guards only". `@input/pen-dom` re-exports it alongside the sheet so hosts have one import site. `types-purity` stays green.

The first shipped vocabulary also carried a second insert/delete taxonomy (`pen-ai-review-insert`, `pen-ai-review-delete`, `pen-suggestion-final-text-change`, `pen-ai-review-preview-original`) that the sheet did not style. Producers stacked those names on spans already painted by `pen-suggestion-insert` / `pen-suggestion-delete`. They were dropped so one class means one job and GATE 2.8 requires every `REVIEW_SURFACE_CLASSES` name to appear as an interpolated selector in the sheet.

There were five producer sites, not four. This section names `suggestionDecorations.ts`, `streamingPreviewVirtualDecorations.ts`, `reviewPresentationStyles.ts`, and `contextDecorations.ts`, but only three of those emitted class names — the fourth was the style module itself, now deleted. The two it missed are `streamingPreviewDeleteDecorations.ts` in `@input/pen-ai` and `field-editor/reconcilerMarks.ts` in `@input/pen-dom`, which names `pen-suggestion-insert` / `pen-suggestion-delete` when it reconciles a `suggestion` mark. That last one is why the vocabulary has to be shared rather than owned by either package. GATE 2.8's test walks `@input/pen-ai`, `@input/pen-dom`, `@input/pen-react`, and `@input/pen-vue` source for literal review class names, so a sixth site cannot appear unnoticed.

## Exit Gate

- GATE 2.10 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/editChannel.comparison.test.ts`
  expect: exit 0 — RS6: the corpus fidelity assertions hold — what the preview showed is what accept applied, per operation.
- GATE 2.11 [test]: `pnpm --filter @input/pen-conformance test`
  expect: exit 0 — presentation changes did not disturb the rendering conformance net.
- GATE 2.12 [grep]: `rg -n "structuredPreview|structured-preview|useStructuredIntentTransport" packages --type ts`
  expect: exit 1 — the producer-less structured-preview surface is gone, including the transport flag that gated its last producer. If this population survives the wave, RS1's "only three surfaces" claim is false by inventory.
- GATE 2.13 [test]: `pnpm build && pnpm typecheck && pnpm test`
  expect: exit 0 — repo-wide green at wave close (standing gate).

## Deletions

- `useAIStructuredPreview.ts`, `structuredTargetPreview.tsx`, and `utils/structuredPreview.ts` — the producer-less structured-preview surface.
- `data-structured-preview-*` — the progress attributes hosts could read off that surface.
- the selection-rewrite decoration stack, replaced by review-surface suggestions.
- the buffered markdown block preview renderer, replaced by streaming preview blocks.
