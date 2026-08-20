# @input/pen-dom

## .

`./dist/index.d.ts`

### function

- getClosestEditorRoot
- handleEditorDocumentKeyDown
- handleEscapeSelectionTransition
- handleTableCellSelectionKeyDown
- isFieldEditorTextEditingKey
- resolveEditorUrl
- shouldHandleEditorKeyboardEvent
- urlPolicyExtension
- urlPolicyFromEditor

### guard

- isActiveFieldEditorTextEntryTarget
- isFieldEditorTextEntryTarget
- isNativeTextEntryTarget
- isTextEntryTarget

### value

- DEFAULT_SELECT_ALL_BEHAVIOR
- EditorSelectAllBehavior
- FieldEditorFocusReason
- FieldEditorFocusRequest
- FieldEditorImpl
- FieldEditorSession
- PasteImporters
- PenFieldEditorFocusOptions
- PenFocusAction
- PenFocusDecision
- PenFocusLifecycleEvent
- PenFocusLifecycleListener
- PenFocusPolicy
- PenFocusReason
- PenFocusRequest
- resolveSelectAllBehavior
- UrlContext
- urlPolicy
- UrlPolicy

## ./field-editor

`./dist/field-editor/index.d.ts`

### value

- applyDeltaToDOM
- buildMoveInlineAtomOps
- classifySelectionSurface
- computeTextDiff
- contractFieldEditorRange
- domSelectionToEditor
- editorSelectionToDOM
- ExpandedBlockRole
- expandFieldEditorRange
- extractTextFromDOM
- FieldEditorFocusReason
- FieldEditorFocusRequest
- FieldEditorStore
- FieldEditorStoreSnapshot
- FieldEditorSurfaceMode
- FieldEditorSurfaceState
- fullReconcileToDOM
- getCaretOffset
- getExpandedBlockRole
- getInlineAtomAtOffset
- getSelectionOffsets
- handleClipboardPaste
- handleCopy
- handleCut
- handlePaste
- INLINE_ATOM_LOGICAL_LENGTH
- InlineAtomDropTarget
- InlineAtomSnapshot
- InlineAtomSource
- moveInlineAtom
- MoveInlineAtomOptions
- PenFieldEditorFocusOptions
- PenFocusAction
- PenFocusDecision
- PenFocusLifecycleEvent
- PenFocusLifecycleListener
- PenFocusPolicy
- PenFocusReason
- PenFocusRequest
- replaceInlineAtomWithText
- ReplaceInlineAtomWithTextOptions
- resolveInlineAtomDropTarget
- ResolveInlineAtomDropTargetOptions
- resolveMarksAtPosition
- restoreSelection
- saveSelection
- SelectionPoint
- shouldUseBlockSelection
- TextDiffOp

## ./field-editor/*

`./dist/field-editor/*.d.ts`

glob members:

- backendLifecycleController.d.ts
- beforeinputMap.d.ts
- cellEditingController.d.ts
- clipboard.d.ts
- commands.d.ts
- commandsBlock.d.ts
- commandsDelete.d.ts
- commandsEnter.d.ts
- commandsNavigation.d.ts
- commandsShared.d.ts
- contenteditableBackend.d.ts
- contenteditableBackendCore.d.ts
- contenteditableBackendEvents.d.ts
- contenteditableBackendSelection.d.ts
- contenteditableDirectHandlers.d.ts
- contenteditableDomHelpers.d.ts
- contentResolution.d.ts
- controller.d.ts
- crdt.d.ts
- crossBlock.d.ts
- dropResolver.d.ts
- editContextBackend.d.ts
- editContextBackendCore.d.ts
- editContextBackendInput.d.ts
- editContextBackendRuntime.d.ts
- editContextBackendSelection.d.ts
- editContextDom.d.ts
- editContextSelectionAuthority.d.ts
- editContextTypes.d.ts
- expandedContentEditableBackend.d.ts
- fieldEditorImpl.d.ts
- fieldEditorImplCore.d.ts
- fieldEditorImplHelpers.d.ts
- fieldEditorImplLifecycle.d.ts
- fieldEditorImplRuntime.d.ts
- fieldEditorImplSelection.d.ts
- focusController.d.ts
- historyOrigin.d.ts
- historySelectionCoordinator.d.ts
- index.d.ts
- inlineAtomDom.d.ts
- inlineAtomInteraction.d.ts
- inlineAtomLogicalDom.d.ts
- inlineAtomModel.d.ts
- inlineInputRules.d.ts
- inlineTextTransaction.d.ts
- keyBindingShortcuts.d.ts
- keyHandling.d.ts
- keyHandlingInlineAtoms.d.ts
- keymap.d.ts
- markBoundary.d.ts
- offsetDomain.d.ts
- pendingMarkController.d.ts
- reconciler.d.ts
- reconcilerDeltaApply.d.ts
- reconcilerFull.d.ts
- reconcilerMarks.d.ts
- reconcilerPatch.d.ts
- reconcilerSelection.d.ts
- selectAllController.d.ts
- selectionAuthority.d.ts
- selectionBridge.d.ts
- selectionBridgeOffsets.d.ts
- selectionCoordinator.d.ts
- selectionDomQueries.d.ts
- selectionGeometry.d.ts
- selectionProjectionController.d.ts
- sessionReconciler.d.ts
- store.d.ts
- textDiff.d.ts
- textInputPipeline.d.ts
- transfer.d.ts
- transferBlocks.d.ts
- transferImages.d.ts
- transferPaste.d.ts
- transferSelection.d.ts
- transferTypes.d.ts

## ./constants/selectAll

`./dist/constants/selectAll.d.ts`

### function

- resolveSelectAllBehavior

### value

- DEFAULT_SELECT_ALL_BEHAVIOR

### type

- EditorSelectAllBehavior

## ./types/paste

`./dist/types/paste.d.ts`

_no exports_

## ./utils/clipboardPayload

`./dist/utils/clipboardPayload.d.ts`

### class

- PenClipboardFallbackError

### function

- createPenClipboardPayload
- decodePenBlocksFromHtml
- encodePenBlocksForHtml
- parsePenClipboardPayload
- readPenClipboardJson
- serializePenClipboardPayload

### value

- PEN_CLIPBOARD_JSON_MIME
- PEN_CLIPBOARD_JSON_MIME_LEGACY
- PEN_CLIPBOARD_PAYLOAD_VERSION
- PenClipboardPayload

### type

- Delta
- PenBlock
- PenClipboardFallbackFlavor
- PenClipboardReadResult

## ./utils/dataAttributes

`./dist/utils/dataAttributes.d.ts`

### function

- buildDataAttributes
- penDataAttr

### value

- DATA_ATTRS

## ./utils/inlineDecorations

`./dist/utils/inlineDecorations.d.ts`

### function

- applyInlineDecorationsToDeltas
- buildInlineDecorationsRenderSignature
- filterVisibleInlineDecorationDeltas
- inlineDecorationsRequireFullReconcile
- serializeInlineDecorationForRender

### value

- INLINE_DECORATION_ATTRIBUTE_KEY
- VIRTUAL_INLINE_DECORATION_ATTRIBUTE

## ./utils/parentIdTree

`./dist/utils/parentIdTree.d.ts`

### function

- appendParentIdChildBlock
- getAdjacentVisibleBlockId
- getInsertSiblingBlockOp
- getLastDescendantBlockId
- getParentIdChildBlockIds
- getRootBlockIds
- getVisibleBlockIds
- isInsideParentIdContainer
