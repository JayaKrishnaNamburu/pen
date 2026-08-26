---
"@input/pen-ai": minor
"@input/pen-react": minor
---

Delete the producer-less structured-preview surface (v5 wave 2, RS1/GATE 2.12). Closing the text-parsed edit channel left this surface with no reachable producer: its last one was gated on a transport flag that no registered adapter can satisfy, since every block adapter is `flow-text`. Removing it drops two hand-rolled JSON Patch implementations — a 380-line producer in `@input/pen-ai` and a 374-line consumer in `@input/pen-react` — that were kept in sync for a stream event that was never emitted.

Removed from `@input/pen-ai`: the `GenerationStructuredPreviewState` and `StructuredPreviewPatchOperation` types, the `structured-preview` stream event, and the `structuredPreview` field on generation and session-turn state.

Removed from `@input/pen-react`: the `Pen.AI.StructuredTargetPreview` primitive and its props, the `useAIStructuredPreview`, `useActiveAIStructuredPreview`, `useAIStructuredPreviewContent`, and `useAIStructuredTargetPreview` hooks, and their selection types. `Pen.AI.Progress` no longer emits `data-structured-preview-count`, `data-structured-preview-state`, or `data-structured-preview-patch-count`, and `Pen.AI.ChangeList` no longer emits `data-review-preview-active`. All four attributes were unreachable — they could only be set by the deleted surface — so hosts reading them were reading a constant.
