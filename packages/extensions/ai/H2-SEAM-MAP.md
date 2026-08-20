# H.2 Seam Map (CH1 / CH4)

Temporary inventory for Wave H step H.2. Seams are from `spec-v2/waves/wave-h-code-health.md`. This slice reassembles **session/controller state** only.

Status: `this-slice` = methods moved onto `src/controller/sessionState.ts` (`AIControllerSessionState`). Remaining mixin members stay on `Object.assign` until later slices.

## Seams

| Seam | Meaning |
| --- | --- |
| session/controller state | Controller lifecycle, `_state`, session CRUD, turn resolution, contextual prompt, emit |
| command context | Command registry, `runCommand` / `runPrompt` / retry |
| stream events | Stream event buffer and subscribers |
| generation execution | Execute/cancel generation, local ops, commits, working set, fast-apply |
| plan run/validate/review | Accept/reject generation and review items; runtime plan/review/planner modules |
| inline history | Undo/redo snapshots and shortcut queue (adjacent; not a named spec seam) |
| decorations/suggestions | Review preview decorations, persistent/ephemeral suggestions |

## `extensionParts/aiControllerMethodsPart*.ts` (Object.assign mixin)

| File | Method | Seam | Status |
| --- | --- | --- | --- |
| Part1 | `destroy` | session/controller state | this-slice |
| Part1 | `getState` | session/controller state | this-slice |
| Part1 | `subscribe` | session/controller state | this-slice |
| Part1 | `getStreamEvents` | stream events | later |
| Part1 | `subscribeStreamEvents` | stream events | later |
| Part1 | `getCommands` | command context | later |
| Part1 | `getCommandContext` | command context | later |
| Part1 (via `sessionControllerMethods`) | `getSessions` | session/controller state | this-slice |
| Part1 | `getActiveSession` | session/controller state | this-slice |
| Part1 | `subscribeSessions` | session/controller state | this-slice |
| Part1 | `startSession` | session/controller state | this-slice |
| Part1 | `openContextualPrompt` | session/controller state | this-slice |
| Part1 | `updateContextualPromptDraft` | session/controller state | this-slice |
| Part1 | `setContextualPromptAnchorRect` | session/controller state | this-slice |
| Part1 | `resolveSessionTurn` | session/controller state | this-slice |
| Part1 | `acceptSessionTurn` | session/controller state | this-slice |
| Part1 | `rejectSessionTurn` | session/controller state | this-slice |
| Part1 | `runSessionPrompt` | session/controller state | this-slice |
| Part2 | `canReuseSessionPrompt` | session/controller state | this-slice |
| Part2 | `resolveSession` | session/controller state | this-slice |
| Part2 | `acceptSession` | session/controller state | this-slice |
| Part2 | `rejectSession` | session/controller state | this-slice |
| Part2 | `cancelSession` | session/controller state | this-slice |
| Part2 | `suspendInlineSession` | session/controller state | this-slice |
| Part2 | `resumeInlineSession` | session/controller state | this-slice |
| Part2 | `canUndoInlineHistory` | inline history | later |
| Part2 | `canRedoInlineHistory` | inline history | later |
| Part2 | `undoInlineHistory` | inline history | later |
| Part2 | `redoInlineHistory` | inline history | later |
| Part2 | `canHandleInlineHistoryShortcut` | inline history | later |
| Part2 | `handleInlineHistoryShortcut` | inline history | later |
| Part2 | `runCommand` | command context | later |
| Part2 | `runPrompt` | command context | later |
| Part2 | `retryActiveGeneration` | command context | later |
| Part3 | `acceptActiveGeneration` | plan run/validate/review | later |
| Part3 | `rejectActiveGeneration` | plan run/validate/review | later |
| Part3 | `acceptReviewItem` | plan run/validate/review | later |
| Part3 | `rejectReviewItem` | plan run/validate/review | later |
| Part3 | `acceptReviewItems` | plan run/validate/review | later |
| Part3 | `rejectReviewItems` | plan run/validate/review | later |
| Part3 | `_applyReviewItems` | plan run/validate/review | later |
| Part4 | *(spread only)* `generationRunnerMethods` | generation execution | later |
| Part4 | *(spread only)* `decorationControllerMethods` | decorations/suggestions | later |
| Part4 | *(spread only)* `suggestionControllerMethods` | decorations/suggestions | later |
| Part5 | `_executeLocalOperation` | generation execution | later |
| Part6 | `_executeGeneration` | generation execution | later |
| Part7 | `_commitRequestedOperationResult` | generation execution | later |
| Part7 | `_commitSelectionRewrite` | generation execution | later |
| Part8 | `_commitBufferedBlockGeneration` | generation execution | later |
| Part9 | `_commitBufferedMarkdownFastApply` | generation execution | later |
| Part9 | `_resolveMarkdownFastApplyScope` | generation execution | later |
| Part9 | `_buildPlanValidationContext` | plan run/validate/review | later |
| Part10 | `_resolvePlanValidationTargetKind` | plan run/validate/review | later |
| Part10 | `_verifyMarkdownFastApplyResult` | generation execution | later |
| Part10 | `_verifyFlowPatchPlanResult` | generation execution | later |
| Part10 | `_buildMarkdownScopedReplacementOps` | generation execution | later |
| Part10 | `_summarizeFastApplyFallbackOps` | generation execution | later |
| Part10 | `_readBlockIdsFromOp` | generation execution | later |
| Part10 | `_recordFastApplyDebug` | generation execution | later |
| Part10 | `_applySuggestedMarkdownPlaceholderReplacement` | generation execution | later |
| Part10 | `_refreshStreamingMarkdownBlockPreview` | generation execution | later |
| Part10 | `_commitStructuredPlan` | plan run/validate/review | later |
| Part11 | `_buildFallbackMutationReceipt` | generation execution | later |
| Part11 | `_buildWorkingSet` (and siblings in file) | generation execution | later |
| Part11 | `_refineRouteWithWorkingSet` | generation execution | later |
| Part12 | `_validateWorkingSet` | generation execution | later |
| Part12 | `_resolveMarkdownFastApplyWindow` | generation execution | later |
| Part12 | `_applySuggestedAIOps` | generation execution | later |
| Part12 | `_captureBlockRevisions` | generation execution | later |
| Part12 | `_resolveContentFormat` | generation execution | later |
| Part12 | `_buildTextBlockGenerationOps` | generation execution | later |
| Part12 | `_buildMarkdownBlockGenerationOps` | generation execution | later |
| Part12 | `_createSelectionSignature` | generation execution | later |
| Part12 | `_setState` | session/controller state | this-slice |
| Part12 | `_resolveActiveGeneration` | generation execution | later |
| Part13 | `_resolveSessionTurn` | session/controller state | this-slice |
| Part13 | `_createInlineTurnUndoBeforeSnapshot` | inline history | later |
| Part13 | `_updateSession` | session/controller state | this-slice |
| Part13 | `_recordSessionFastApplyMetrics` | session/controller state | this-slice |
| Part14 | `_updateSessionTurn` | session/controller state | this-slice |
| Part14 | `_syncSessionsFromDocument` | session/controller state | this-slice |
| Part14 | `_setStreamEvents` | stream events | later |
| Part14 | `_appendStreamEvent` | stream events | later |
| Part14 | `_emit` | session/controller state | this-slice |
| Part14 | `_emitStreamEvents` | stream events | later |
| Part14 (via `inlineHistoryRecording`) | `registerExternalInlineTurnResult` | inline history | later |
| Part14 | `_createExternalInlineTurnHistorySessions` | inline history | later |
| Part14 | `_recordInlineHistorySnapshot` | inline history | later |
| Part14 | `_recordInlinePromptSubmissionCheckpoint` | inline history | later |
| Part15 | *(spread only)* `inlineHistoryNavigation` | inline history | later |
| Part16 | `_findInlineHistorySnapshotForResolvedTurn` | inline history | later |
| Part16 | `_resolveInlineHistoryTraversalSnapshot` | inline history | later |
| Part16 | `_resolveShortcutInlineHistoryTraversalSnapshot` | inline history | later |
| Part16 | `_scheduleQueuedInlineHistoryShortcutFlush` | inline history | later |
| Part16 | `_resolvePendingInlineHistoryRestoreTargetIndex` | inline history | later |
| Part16 | `_handleHistoryApplied` | inline history | later |
| Part16 | `_setInlineSessionComposerOpen` | session/controller state | this-slice |

## Already-extracted controller bags (still Object.assign'd)

These are typed `this: AIControllerMethodHost` bags, still composed through Part4 / Part14 / Part15. Later slices promote them off the mixin.

| File | Methods | Seam |
| --- | --- | --- |
| `controllers/sessionControllerMethods.ts` | session public API | session/controller state — **deleted this slice** (moved to class) |
| `controllers/generationRunnerMethods.ts` | `cancelActiveGeneration`, command menu, suggest mode, `handleExternalCommit`, `_run*Generation` | generation execution |
| `controllers/decorationControllerMethods.ts` | streaming review preview, `buildDecorations` | decorations/suggestions |
| `controllers/suggestionControllerMethods.ts` | ephemeral + persistent suggestion sync/accept/reject, `handleDocumentChange` | decorations/suggestions |
| `controllers/inlineHistoryNavigation.ts` | shortcut/history traversal | inline history |
| `controllers/inlineHistoryRecording.ts` | snapshot recording, external turn registry | inline history |

## Generation helpers (not mixin members; called with `controller: any`)

| File | Function | Seam |
| --- | --- | --- |
| `generationExecution.ts` | `executeGeneration` | generation execution |
| `generationExecutionLoop.ts` | `runGenerationLoop` | generation execution |
| `generationExecutionFinalize.ts` | `finalizeGenerationExecution`, `handleGenerationExecutionError` | generation execution |
| `localOperationExecution.ts` | `executeLocalOperation` | generation execution |
| `localOperationExecutionFinalize.ts` | `finalizeLocalOperationExecution` | generation execution |

## `extensionHelpersPart1`–`Part9`

Standalone functions (session targeting, equality, selection snapshots, op builders). Not mixin members. Reassemble with the seam that calls them; do not keep the `PartN` names.

## Runtime `*Parts/` (not the controller mixin; same CH4 ban)

| Directory | Seam |
| --- | --- |
| `runtime/planExecutor/` | plan run/validate/review (typed `types`/`state`/`alignment`/`inline`/`flowPatch`/`execute`; Part files deleted) |
| `runtime/planValidation/` | plan run/validate/review (typed `primitives`/`validate`; Part files deleted) |
| `runtime/reviewArtifacts/` | plan run/validate/review (typed `types`/`previews`/`paths`/`build`; Part files deleted) |
| `runtime/structuredPlanner/` | plan run/validate/review (typed `types`/`primitives`/`normalize`/`parse`; Part files deleted) |
| `runtime/structuredIntent/` | plan run/validate/review (typed `types`/`primitives`/`parse`/`prompt`; Part files deleted) |
| `runtime/playgroundPlanner/` | playground planner (typed `types`/`selection`/`prompts`/`plans`; Part files deleted) |

## Out of this slice

- `hasWarnedAboutWithoutOption` in core — deleted with the H.6 destroy slice
