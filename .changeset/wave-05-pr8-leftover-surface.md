---
"@input/pen-dom": patch
---

Delete leftover selection suppress stubs and the always-null programmaticInputRange pin from EditContext range resolution.

SelectionProjectionController no longer publishes consumeDomSelectionProjectionSuppression, suppressNextDomSelectionProjection, or shouldSuppressSelectionSync. HistorySelectionCoordinator.shouldSuppressSelectionSync is gone. The five 5.6 delete-list files stay: the projector, FieldEditorImpl selection methods, trusted-caret stack, applyBackendSelectionUntilNextFrame, and the published selectionBridge subpath still have live jobs.
