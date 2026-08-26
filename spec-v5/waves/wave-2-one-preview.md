# Wave 2: One Preview

Depends on: wave 1. Blocks: wave 3.
Packages touched: `@input/pen-ai` (presentation paths), `@input/pen-dom` (the exported review stylesheet), `playground/`, binding styling docs (`packages/rendering/react/STYLING.md`, `packages/rendering/vue/STYLING.md`).

Discharges RS1–RS6. The four edit-preview mechanisms collapse onto the review surface; the visible stream and the autocomplete ghost are explicitly kept (`02-review-surface.md` §2). The generate-lane buffered markdown preview migrates to streaming preview blocks, which unblocks wave 3's planner deletion (the generation-execution path stops consuming the planner's preview parsing). The styling contract ships from one module with CSS custom properties as the theme seam.

Order of PRs (WA11): the migrations land against the existing review surface first; the bespoke presentation stacks and the `markdown-fast-apply` plan helpers are deleted immediately after, in the same wave.

## Entry Gate

- GATE 2.1 [grep]: `rg -n "pen-fast-apply" packages playground examples`
  expect: exit 1 — wave 1 held; the channel teardown is not being re-litigated here.
- GATE 2.2 [test]: `pnpm --filter @input/pen-ai test`
  expect: exit 0 — green before the presentation migration starts.

## 1. The Migrations

Selection rewrites in suggestions mode stage through the suggest-mode interceptor and render as review-surface suggestions; the bespoke selection-rewrite decoration stack is deleted. Block generation renders streaming preview blocks in flight and stages on completion; the buffered markdown preview renderer and its plumbing in the generation-execution path are deleted, together with the `markdown-fast-apply` plan helpers this wave strands.

**A fourth surface joined the deletion list on 2026-08-26, already producer-less.** Closing UC3's text-parsed door (`../01-channel.md`, UC3 shipped correction) removed the only reachable producer of the structured-preview state. Its last remaining producer is `onStructuredData` in `controller/generationExecutionLoop.ts`, gated on `useStructuredIntentTransport`, and `__tests__/uc3.planReachability.test.ts` proves that flag can never be true: every registered block adapter carries `transportKind: "flow-text"` and adapter resolution cannot yield anything else. So this wave deletes the surface outright rather than migrating it — `Pen.AI.Progress`'s `data-structured-preview-*` attributes, `primitives/ai/structuredTargetPreview.tsx`, `hooks/useAIStructuredPreview.ts`, `utils/structuredPreview.ts`, the preview-patch and preview-equality helpers, and the `structuredPreview` field on session/generation state. The React test that covered it (`aiPrimitives.25.test.tsx`, 359 lines) is already deleted. Wave-2 rule: no PR in this wave may add a producer to keep this surface alive.

- GATE 2.3 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/rs2.selectionRewrite.test.ts`
  expect: exit 0 — RS2 claimed for the selection lane: rewrite stages through the interceptor and renders review decorations; the deleted stack's decoration classes appear nowhere in the render.
- GATE 2.4 [test]: `pnpm --filter @input/pen-ai test -- src/__tests__/rs2.blockGeneration.test.ts`
  expect: exit 0 — RS2 claimed for the generate lane: block generation previews as streaming preview blocks, then stages.
- GATE 2.5 [grep]: `rg -n "markdown-fast-apply|MARKDOWN_FAST_APPLY_OMISSION_MARKER" packages --type ts`
  expect: exit 1 — the stranded plan helpers and the omission marker are gone (RS5); preview payloads carry no channel-control tokens.

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
