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

## 3. The Styling Contract

`@input/pen-dom` exports one review stylesheet and one class vocabulary; the four constant sites collapse onto it; hosts theme via CSS custom properties. The playground drops its hand-rolled review rules; both STYLING docs point at the exported contract.

- GATE 2.8 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/rs4.stylingContract.test.ts`
  expect: exit 0 — RS4 claimed: all review decoration class names resolve from the single exported vocabulary.
- GATE 2.9 [grep]: `rg -n "pen-suggestion-insert|pen-suggestion-delete|pen-ai-review-preview" playground/src/editor/editor.css`
  expect: exit 1 — the playground no longer re-implements the review rule blocks it hand-writes today; it imports the sheet and sets custom properties. (Note the seam this wave closes: the review constants in `reviewPresentationStyles.ts` are inline-style arrays, not classes — RS4 replaces inline styling with the exported class vocabulary so hosts can theme at all.)

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
