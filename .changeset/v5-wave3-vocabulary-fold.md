---
"@input/pen-ai": minor
"@input/pen-react": minor
"@input/pen-document-ops": patch
---

Fold the AI route vocabulary to members with producers, give staleness one authority, declare the in-editor tool mounts, and rename the `fast-apply` surfaces (spec-v5 wave 3, UC4–UC8 and RS3)

`AIApplyStrategy` and `AI_APPLY_STRATEGIES` are removed. The strategy was derived rather than decided — the router computed all three members from the lane, target, and content format it had already chosen — and every consumer read it as a single question: whether durable edits arrive as `edit_document` tool calls. That question is now `editsArriveAsToolCalls: boolean` on the route decision and on generation state.

Union members that no input produces are removed: `ephemeral-preview` from `AIMutationMode`, `app` from the block classes, `app-structured` from the transport kinds, `staged_review` from `AIMutationReceiptStatus`, and the `AIStructuredLane` and `AIQualityMetricId` vocabularies. A new router property test keeps each union's declared set equal to its produced set in both directions, so a member without a producer fails rather than lingering.

View fingerprints are now the only staleness gate. `getBlockRevision` is gone from `@input/pen-ai` and working-set envelopes no longer stamp `blockRevisions`; `edit_document` refuses on fingerprint mismatch. Local-operation provenance stamps `syncedGeneration` and suggestion scopes keep `documentGeneration`. The counter itself remains on the editor in `@input/pen-core`.

The `@input/pen-document-ops` README states which surface each tool serves: the in-editor loop mounts read tools plus `edit_document`, and the single-purpose mutators (`insert_block`, `update_block`, `delete_block`, `move_block`, `write_document`) stay host-facing. A question prompt stages nothing, opens no review session, and leaves the document unchanged.

The `fast-apply` naming — left over from the deleted XML channel — is renamed onto `commit`, the word already used for turning generated text into document ops:

- `FastApplyDebugState` → `CommitDebugState`
- `FastApplyFallbackMetrics` → `CommitFallbackMetrics`
- `AISessionFastApplyMetrics` → `AISessionCommitMetrics`
- `AIDebugLogFastApplyMetrics` → `AIDebugLogCommitMetrics`
- `AISessionMetrics.fastApply` → `.commit`; the generation debug state's `fastApply` → `commit`
- `AISessionCommitMetrics.nativeFastApplyCount` → `selectionReplacementCount`
- the `native-fast-apply` execution path → `selection-replacement`

Two telemetry surface names change on the wire: `ai-markdown-fast-apply` → `ai-markdown-commit` and `ai-markdown-fast-apply-verify` → `ai-markdown-commit-verify`. Hosts filtering commit telemetry by surface name need to update those strings.

`CommitDebugState` also drops three fields no code wrote: `confidence`, `verificationFailureReason`, and `untouchedBlockMutationCount`.

The end-of-session unapplied-edit report no longer keys on the deleted apply strategy. It now reports a turn that called `edit_document`, landed nothing, and neither applied operations nor refused — a lost edit. Turns that refuse explicitly, apply partially, or stage suggestions are accounted for and are not reported, and a turn that never calls the tool is an answer rather than a lost edit. The requested-operation path reports it too, which it previously did not.
