# v5 Concept: One Of Each

Status: adopted 2026-08-26. The `UC`/`RS`/`FE`/`HB` rules in `01`–`04` are normative; the wave files under `waves/` are the execution plan. All numbers below were measured against this tree on 2026-08-26 with the commands shown. Regenerate rather than trust.

**Correction, 2026-08-26 (same day, after the XML teardown).** The XML channel is gone. Durable edits always go through `edit_document`; `aiExtension()` has no `editChannel` option. `AIRouteLane` no longer includes `context-first`. The measured facts below captured the pre-teardown inventory. `spec/packages/extensions/ai.md` EC12 is the current channel semantics.

## 1. The Verdict

This set exists because an end-to-end review of the editor areas and the AI tooling found the architecture **right and the inventory wrong**.

What is healthy, and stays: the layered package graph with strictly downward dependencies; `editor.apply(ops, { origin })` as the single durable write path; anchors and typed ops; the empty-block sentinel removal; the conformance harness and gate discipline; the edit-channel design in `spec/packages/extensions/ai.md` — block-addressed structured ops, fingerprint staleness, single-shot refusal — which won its corpus measurement and now carries real sessions.

What is not healthy: the repo currently holds **both the winner and the loser of every fight it has already finished**. Two edit channels ship in one package with the loser as the library default. Six presentation mechanisms can put AI content in front of a user. The routing vocabulary spans a nominal space three orders of magnitude larger than its real behavior. Three field-editor backends re-implement each other's lifecycle wiring, and the DOM scheduler that v2 designed to own frames still is not on the production apply path. The React binding is 9.7× the size of the Vue binding without a written decision that this is intended.

None of this is a redesign problem. It is a subtraction problem, and subtraction is what v5 does.

## 2. Measured Facts

Each claim names its command. Counts exclude `__tests__` and `*.test.ts` unless stated.

1. **Package mass.** `@input/pen-ai` is 33,017 source lines across 169 files; its `controller/` directory alone is 7,617 lines across 22 files. `@input/pen-dom` is 27,999 lines across 149 files. `@input/pen-react` is 19,727 lines across 197 files; `@input/pen-vue` is 2,037 lines across 20 files — a 9.7× spread between the two bindings.
   `rg --files <pkg>/src -g '*.ts' -g '!**/__tests__/**' -g '!*.test.ts' | while read f; do wc -l "$f"; done | awk '{s+=$1; n++} END{print s, n}'`
2. **Two edit channels, one winner.** _Retired 2026-08-26 by Wave 1 (commit `bdcf4ec`): the XML channel is deleted and `AI_EDIT_CHANNELS` no longer exists. What replaced this fact is fact 11._ As measured at adoption: `AI_EDIT_CHANNELS` was `["fast-apply", "tool"]` (`runtime/contracts.ts:70`), and the doc comment on it still said "fast-apply stays the default until the Wave 0 measurement decides." That measurement **has** decided: the better-ai Wave 0 corpus run shipped the tool channel, the loop now mounts `edit_document` as its only mutating tool (`agentic/loop.ts:719` forces `{ type: "tool", name: "edit_document" }` under EC17), and `spec/packages/extensions/ai.md` carries the dated amendment making tool-edit the only channel the loop mounts. Yet `extension.ts` still defaults library consumers to `"fast-apply"`, and the XML parser, the closing pass, and both fast-apply strategies remain in the tree.
3. **The routing vocabulary.** `runtime/contracts.ts` exports fifteen vocabulary unions. A route shape multiplies `PromptIntent` (8) × `AIRouteLane` (5) × `AIApplyStrategy` (4) × `AIEditChannel` (2) × `AIMutationMode` (5) — a nominal space of 1,600 shapes. The router that folds this space (`runtime/router.ts`) is 551 lines; the behaviors actually reachable from a host are roughly a dozen.
4. **The structured planner lane.** _Superseded 2026-08-26 by fact 11, twice: first on the measurement (4,279 lines, not 2,847) and its "cannot be planned from the front door" claim (the front door was the text stream), then on existence — `runtime/structuredPlanner/` is deleted. Read fact 11 instead._ As measured at adoption: `runtime/structuredPlanner/` + `planExecutor/` + `planValidation/` total 2,847 lines across 12 files. Their production consumers are the generation-execution path of the legacy channel (`generationExecution*.ts`, `markdownFastApplyMethods.ts`) and the public barrel. The planner's own kind gate (`structuredPlanner/parse.ts`, `resolveAllowedPlanKinds`) never yields `flow_patch` for primary edits, so the lane's flagship op cannot be planned from the front door.
5. **Six ways to show one answer.** In-flight or reviewable AI content can reach the user through: the direct visible stream (`openTextStream` typing into the document), selection-rewrite suggestion decorations, staged block suggestions (suggest-mode interceptor), the buffered markdown block preview, the autocomplete ghost overlay, and the tool-edit review surface (streaming preview text plus staged review decorations). Six mechanisms, four owners, two styling contracts.
6. **Frame authority is still split.** `DomScheduler.acceptCommit` (`rendering/dom/src/scheduler.ts:90`) has zero production callers; its only invocations are the conformance scenario, whose own annotation reads "DomScheduler is not on the production apply path (Wave 2 still open)." Meanwhile four `requestAnimationFrame` call sites live outside the scheduler in production DOM code: three in `field-editor/contentGestures.ts` (lines 182, 244, 1113) and one in `field-editor/inlineAtomWrapperInteractions.ts` (line 334).
   `rg -n 'requestAnimationFrame' packages/rendering/dom/src -g '!scheduler.ts' -g '!**/__tests__/**'`
7. **Hotspot files.** `contentGestures.ts` 1,143 lines (largest file in pen-dom); `editDocument.ts` 856 (largest document-ops tool); `applyPipelineRunner.ts` 776; `extension.ts` (ai) 747; `agentic/loop.ts` 737; `selectionBridgeOffsets.ts` 561; `router.ts` 551; `aiControllerMethodHost.ts` 474 lines of structural interface for the method-bag facade; `expandedContentEditableBackend.ts` 460.
8. **Two staleness authorities.** The tool channel gates edits on working-set view fingerprints (`runtime/viewHashes.ts`, EC7/EC9), while the older per-block revision counter (`getBlockRevision`) still runs beside it for the legacy channel's working-set validation. Both are alive; only one is load-bearing for edits.
9. **Duplicated review styling.** The AI review CSS class constants are consumed from four sites (`suggestionDecorations.ts`, `streamingPreviewVirtualDecorations.ts`, `reviewPresentationStyles.ts`, `contextDecorations.ts`), and every host re-implements the actual colors: the playground carries its own `editor.css` rules, and both binding STYLING docs tell consumers to write their own.
10. **Host inventory.** Four host surfaces exist (playground, `examples/react|vue|vanilla`, `packages/docs`, presets consumers), while `examples/*/dist` and `packages/docs/dist` build outputs currently sit untracked in the working tree — nothing ignores them.
    `git status --short | rg 'dist/'`
11. **The second text-parsed channel (added 2026-08-26, after Wave 1; closed the same day).** Wave 1 deleted the XML channel and left another text-parsed mutation path standing: the structured planner took its plan as a **`text-delta` JSON payload** that the runtime parsed into ops and staged. It measured 4,279 lines across 22 files, its live doors were review intent and non-markdown block targets (`reconcilePlannerModeWithPrompt` demoted every other flow-markdown route to `text`), and both doors landed on the `tool-loop` lane — so one route could carry `applyStrategy: "tool-edit"` and `plannerMode: "structured"` together.
    _Closed 2026-08-26, ahead of Wave 3 (18 files, 31 insertions, 1,438 deletions, 7 files deleted): `runtime/structuredPlanner/`, the planner prompt, the plan parse, the streamed plan preview, and the whole `plannerMode` vocabulary are gone; `set_block_props` on `edit_document` carries block conversion instead. `planExecutor` (1,323 lines) and `planValidation` (856 lines) survive for review resolution, per UC3's fence, and Wave 3 still owes their extraction and deletion. No mutation is now derived from assistant text._
12. **Naming residue after Wave 1 (added 2026-08-26).** Three names still refer to the deleted channel: the `text-fast-apply` and `markdown-full-replace` strategies (which are legitimate streaming-generation strategies, merely misnamed), `controller/fastApplySupportMethods.ts` (261 lines), and its `ai-markdown-fast-apply` telemetry surfaces. Renamed in Wave 3 under UC5, on the v4 `05-structure.md` CS4 precedent.
13. **A producer-less preview surface (added 2026-08-26, consequence of fact 11's closure).** With the plan door closed, the structured-preview state has no reachable producer. The last one, `onStructuredData` in `controller/generationExecutionLoop.ts`, is gated on `useStructuredIntentTransport`, which `__tests__/uc3.planReachability.test.ts` proves is permanently false: every registered block adapter carries `transportKind: "flow-text"` and adapter resolution cannot yield anything else. Fact 5's six presentation paths are therefore five, and the sixth's plumbing — `data-structured-preview-*` on `Pen.AI.Progress`, `structuredTargetPreview.tsx`, `useAIStructuredPreview.ts`, `utils/structuredPreview.ts`, the preview-patch and preview-equality helpers, and the `structuredPreview` state field — is dead weight for Wave 2 to delete (GATE 2.5b).

## 3. The Five Debts

Stated as prose, not as rules; the rules that retire them live in `01`–`04`.

**The kept loser.** The XML fast-apply channel — parser, closing pass, `text-fast-apply` and `markdown-fast-apply` strategies, the plain-markdown fallback that can apply an unasked-for full replace on parse failure, and the `markdown-full-replace` escape — lost the corpus measurement to the tool channel and remains the library default. Every week it survives, new tests, new amendments, and new host code cite it. The better-ai set explicitly recorded its deletion as the follow-on obligation of shipping the winner; that obligation is now overdue.

**The six-fold preview.** Six mechanisms present AI content, each with its own lifecycle, decorations, and failure modes. Two are genuinely distinct jobs (visible streaming into an empty target; autocomplete ghost text). The other four are variations of "show a proposed edit before it is durable," which is one job. Four implementations of one job is three too many, and the newest one — the tool-edit review surface with its honest streaming preview — is the one the others should collapse into.

**The oversized brain.** The routing matrix (1,600 nominal shapes), the 2,847-line planner lane that cannot plan its flagship op, the 551-line router, the 737-line loop, and the 22-file method-bag controller are all sized for the two-channel world. In a one-channel world, intent classification still matters (question vs. edit, selection vs. document scope) but most of the lane/strategy/planner vocabulary describes paths that no longer exist. The brain should shrink to match its real decision space.

**The triple spine.** Three field-editor backends (EditContext, contenteditable, expanded contenteditable) each own their own listener wiring, teardown, and composition plumbing; the shared parts drifted apart instead of being extracted. The scheduler owns neither frames (four raf sites outside it) nor commits (`acceptCommit` unwired). The 1,143-line gesture file carries pointer selection, drag, and region gestures in one scope. v2's dom-scheduling wave was left open mid-migration, and the seam shows.

**The undeclared host story.** React has table-cell editing, expanded fields, AI review UI, and headless primitives; Vue has a fraction, and no document says which fraction is intended. Examples exist without a CI gate. Build outputs land untracked in the working tree. The presets package promises "batteries included" without stating which batteries. Parity by accident is how the 9.7× spread happened.

## 4. The Deferral Ledger

Obligations this set inherits, with their sources. v5 exists partly because these were recorded honestly and then left to age.

- The edit-channel prototype wave's "if the channel ships" list: delete the XML channel, the closing pass, the plain-markdown fallback, and the revision-counter staleness gate. Recorded 2026-08; not executed. → Waves 1–3.
- `spec/packages/extensions/ai.md` dated amendments: tool-edit is the only channel the **loop** mounts, but `EC12`'s default-flip for library consumers was deferred pending "a few weeks of sessions." The sessions have accumulated; the flip (and then the teardown) is due. → Wave 1.
- Dual staleness (`EC7`/`EC9` beside `getBlockRevision`): the fingerprint gate was specified as the successor, the counter kept "until the channel decision." Decided. → Wave 3.
- v2 `06-dom-scheduling.md` Wave 2: scheduler-owned commits (`acceptCommit`) never landed on the production path; the conformance scenario documents the gap in its own comments. → Wave 4.
- v2 `03-selection.md` S4 fence: the three gesture-file raf sites schedule pointer-selection completion outside the scheduler. Whether they are S4-fenced retries or legitimate gesture scheduling was never adjudicated. → Wave 4 adjudicates under FE rules; if any is a retry in disguise, it is removed, not grandfathered.
- The record protocol (`spec/charter/rule-ids.md`): claimed-scope families join `scripts/claimed-scope.txt` only with their claiming tests. v5 follows the same posture, so the four new families are a standing reminder until their waves land. → Every wave.

## 5. The Correction

- `01-channel.md` (`UC`): one edit channel. The tool channel becomes the only channel; the XML channel, its strategies, its parser and closing pass, the plain-markdown fallback, and the planner lane are deleted, with the route vocabulary shrunk to what remains. Question intent and read-only lanes survive; they are not channel-dependent.
- `02-review-surface.md` (`RS`): one preview surface. Edit previews collapse into the tool-edit review surface (streaming preview text in flight, staged suggestions at rest). Visible streaming for generation into empty targets and autocomplete ghost text remain as the two genuinely different jobs. The styling contract becomes one exported sheet with one class vocabulary.
- `03-field-editors.md` (`FE`): one spine. Backend lifecycle wiring is extracted so backends own only their input technology; the scheduler becomes the only raf owner in production DOM code; the gesture file is split along its three gestures; cell editing states its parity contract with normal fields.
- `04-hosts-and-bindings.md` (`HB`): a declared host story. A capability matrix says what each binding supports on purpose; examples and docs build under CI; build outputs are ignored; presets state their contents; transports state their support tiers.
- `05-phases.md`: six waves, two coordinated releases (0.5 after wave 3, 0.6 after wave 5).

## 6. Non-Goals

- No new editor features, block types, or schema changes.
- No CRDT or transport redesign; no new frameworks or bindings.
- No selection-engine or EditContext redesign beyond what the spine extraction requires; v2/v3 own those designs.
- No prompt-quality or model-behavior work beyond what deletion mechanically requires.
- No new AI tools; `edit_document` consolidation is completion, not expansion.
- No docs-site redesign; docs changes are limited to truth (capability matrix, styling contract, teardown of references to deleted paths).
- No renames for taste. Deletions and moves must be traceable in one diff.

## 7. Resolved Decisions

1. **The XML channel is deleted, not default-off.** Keeping it dark costs the parser, the closing pass, two strategies, the fallback, their tests, and every future contributor reading them. API7 makes breaking minors legal; hosts that need the old behavior pin the previous minor. Decision: delete in one coordinated release (Wave 1), presets/playground/examples move to the tool channel in the same PR.
2. **The plain-markdown fallback dies with its channel.** It exists to rescue XML parse failures by applying an unasked-for full replace — the defect the better-ai concept named. Nothing in the tool channel needs it. Decision: delete, and add a regression test asserting a parse-shaped failure surfaces as a diagnostic, never as an edit.
3. **The structured planner lane is deleted.** 2,847 lines whose only production consumers are the legacy generation path; its kind gate cannot reach the flagship op. Local UI-triggered operations already execute as direct `DocumentOp[]`. Decision: delete planner, executor, validation, and their barrel exports with the channel; anything the review lane still needs is extracted first and measured in the wave, not assumed.
4. **Single-purpose mutating tools stay host-facing, out of the loop.** `insert_block`/`update_block`/`delete_block`/`move_block`/`write_document` remain part of the document-ops tool-server contract for external agents; the in-editor loop mounts only `edit_document` plus reads (already true under EC17 forcing). Decision: keep the tools, delete their loop mounting paths, and say so in the tool-server doc.
5. **Fingerprints are the only staleness gate for edits.** The per-block revision counter is deleted from edit gating; if working-set refresh still needs a change signal, it subscribes to commit events rather than keeping a parallel counter. Decision: one staleness authority (`EC7`/`EC9` fingerprints), Wave 3.
6. **Preview consolidation lands as three surfaces with three jobs.** (a) visible stream for generation into empty/appended targets, (b) autocomplete ghost text, (c) the review surface for every proposed edit (streaming preview in flight, staged suggestions at rest). Selection-rewrite decorations and the buffered markdown block preview migrate onto (c). Decision: RS rules; Wave 2.
7. **The controller facade is subtracted, not redesigned.** The method-bag composition stays (it is typed and it works); Wave 1–3 deletions remove the strategies, planner, and fallback method bags, after which the host interface is re-measured. A facade redesign is out of scope for v5 (WA8). Decision: subtract first, re-measure, stop.
8. **The gesture file is split, not rewritten.** Three modules along the three gestures behind the existing attach entry, no behavior change, with the raf adjudication (FE rules) forced by the split. Decision: Wave 4.
9. **Backend spine extraction is mechanical.** One lifecycle module owns attach/teardown/listener bookkeeping for all three backends; backends keep only input-technology code. No backend behavior changes; conformance scenarios are the net. Decision: Wave 4.
10. **Parity is declared by capability, not by line count.** The HB capability matrix states, per binding, supported / not-supported / planned for: fields, expanded fields, cell editing, AI review UI, streaming preview, autocomplete, overlays. Vue reaching React is **not** a v5 goal; Vue's matrix being honest is. Decision: Wave 5.
11. **Examples and docs join the build gate.** `examples/*` and `packages/docs` build (and examples typecheck) in the turbo graph under CI; `dist/` outputs are gitignored. Decision: Wave 5.
12. **Versioning.** Waves 1–3 ship one coordinated 0.5 with one migration note (channel teardown + preview consolidation + brain shrink). Waves 4–5 ship 0.6 (spine + hosts). Per API7, breaking changes are minors; no deprecation windows.

## 8. Working Agreements

WA1–WA10 are inherited unchanged from `spec/charter/working-agreements.md`. Two get teeth for this train, and one is added:

- WA8 (no redesign under the broom) applies in full to Waves 4–5. Waves 1–3 execute decisions the better-ai measurement already made; that is not redesign, it is collection.
- WA9 (delete the loser the release after the winner ships) is the charter of this entire set; a v5 wave that ships a winner and keeps its loser is failed at review.
- **WA11 — subtract before you shape.** In any area a v5 wave touches, deletion PRs land before refactor PRs. A refactor whose diff could have been a deletion is rejected. A file that would be moved and shrunk is shrunk in place first, so the move diff is honest.
