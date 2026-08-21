# @input/pen-dom

## .

`./dist/index.d.ts`

### class

- DomScheduler

### function

- collapsedRect
- createGeometryReader
- getClosestEditorRoot
- getRootGeometry
- handleEditorDocumentKeyDown
- handleEscapeSelectionTransition
- handleFieldEditorPointerActivate
- handleTableCellSelectionKeyDown
- isFieldEditorTextEditingKey
- measureWithRoot
- mountEditor
- resolveEditorUrl
- shouldHandleEditorKeyboardEvent
- singleRunLineBox
- urlPolicyExtension
- urlPolicyFromEditor
- verticalCaretTarget

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

### type

- Affinity
- BidiRun
- BidiRunGeometry
- DomSchedulerOptions
- DomSchedulerOwner
- DomSchedulerPhase
- FieldEditorPointerActivateOptions
- FieldEditorPointerTarget
- FlushCollect
- GeometryInvalidator
- GeometryMeasureAdapter
- GeometryReader
- GeometryReaderHost
- GeometryReaderOptions
- LineBox
- MountedEditor
- MountEditorOptions
- Point
- Rect
- RootGeometry
- VerticalCaretTarget
- VerticalDirection

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
- commandsListTab.d.ts
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

## ./utils/autocompleteController

`./dist/utils/autocompleteController.d.ts`

### function

- getAutocompleteController

## ./utils/blockSelectionSemantics

`./dist/utils/blockSelectionSemantics.d.ts`

### function

- getBlockSelectionRoleFromSchema
- getBlockSelectionRoleFromType
- getEditorBlockSelectionLength
- getEditorBlockSelectionRole
- getSelectionLengthForRole
- isInlineEditableBlock

### value

- BlockSelectionRole

## ./utils/cellSelection

`./dist/utils/cellSelection.d.ts`

### function

- isCellInSelection

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

## ./utils/flowCapabilities

`./dist/utils/flowCapabilities.d.ts`

### function

- getEditorFlowCapability
- getFlowCapabilityFromSchema
- getFlowCapabilityFromType
- isContinuousTextFlowCapability
- shouldAllowDirectBlockPaste
- shouldAllowFlowInsertionInSlashMenu
- shouldFallbackMixedSelectionToBlock
- shouldForceBlockScopedSelectAll
- shouldShowBlockInDefaultMenus

### value

- FlowBlockCapability

## ./utils/inlineInputRule

`./dist/utils/inlineInputRule.d.ts`

### function

- matchInlineInputRule

### type

- InlineInputRuleMatch

## ./utils/listInputRule

`./dist/utils/listInputRule.d.ts`

### function

- matchListInputRule

### type

- ListInputRuleMatch

## ./utils/selectionFormation

`./dist/utils/selectionFormation.d.ts`

### function

- normalizeSelectionFormation

## ./utils/dataAttributes

`./dist/utils/dataAttributes.d.ts`

### function

- buildDataAttributes
- penDataAttr

### value

- DATA_ATTRS

## ./utils/editorEmptyState

`./dist/utils/editorEmptyState.d.ts`

### function

- computeDocumentEmpty
- computeDocumentPlaceholderVisible
- isInlineContentEmpty

## ./utils/environment

`./dist/utils/environment.d.ts`

### function

- isDevelopmentEnvironment

## ./utils/placeholderVisibility

`./dist/utils/placeholderVisibility.d.ts`

### function

- resolveInlinePlaceholderVisibility

### type

- InlinePlaceholderVisibility
- InlinePlaceholderVisibilityOptions

## ./utils/inlineDecorations

`./dist/utils/inlineDecorations.d.ts`

### function

- applyInlineDecorationsToDeltas
- areInlineDecorationsRenderEqual
- areRenderedTextDeltasEqual
- buildInlineDecorationsRenderSignature
- filterVisibleInlineDecorationDeltas
- inlineDecorationsRequireFullReconcile
- retainRenderedTextDeltas

### value

- INLINE_DECORATION_ATTRIBUTE_KEY
- VIRTUAL_INLINE_DECORATION_ATTRIBUTE

### type

- TextDelta

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

## ./utils/fieldEditorTextEntryAttrs

`./dist/utils/fieldEditorTextEntryAttrs.d.ts`

### function

- fieldEditorTextEntryAttrs

## ./utils/menuPosition

`./dist/utils/menuPosition.d.ts`

### function

- resolveAnchoredMenuPosition

### type

- AnchoredMenuPosition
- MenuAnchorTarget
- MenuPlacementSide

## ./utils/selectionPlacement

`./dist/utils/selectionPlacement.d.ts`

### function

- resolveSelectionRect

## ./utils/tableDefaults

`./dist/utils/tableDefaults.d.ts`

### function

- createDefaultTableColumns
- getStarterTableProps
- getTableActivationTarget
- getTableCellPlaceholder
- hasMeaningfulBlockText

### type

- TableActivationTarget

## ./utils/aiDomScope

`./dist/utils/aiDomScope.d.ts`

### function

- queryAISuggestionAnchorElement
- queryEditorBlockElement
- querySuggestionAnchorElements
- resolveAIRootElement
- resolveEditorContentElement
- resolveEditorRootElement

## ./utils/aiKeyboardScope

`./dist/utils/aiKeyboardScope.d.ts`

### function

- shouldIgnoreAIKeyboardEvent

## ./utils/fieldEditor

`./dist/utils/fieldEditor.d.ts`

### function

- getAttachedFieldEditor
- getAttachedFieldEditorStore

## ./utils/inlineAtomDragPreview

`./dist/utils/inlineAtomDragPreview.d.ts`

### function

- clearInlineAtomDragPreview
- createInlineAtomDragPreview

### type

- InlineAtomDragPreview

## ./utils/replaceElementChildren

`./dist/utils/replaceElementChildren.d.ts`

### function

- replaceElementChildren

## ./utils/slashMenuPopupAria

`./dist/utils/slashMenuPopupAria.d.ts`

### function

- applySlashMenuFieldAria
- clearSlashMenuFieldAria
- getSlashMenuOptionId
- resolveSlashMenuField

## ./utils/suggestionMenuPopupAria

`./dist/utils/suggestionMenuPopupAria.d.ts`

### function

- applySuggestionMenuFieldAria
- clearSuggestionMenuFieldAria
- resolveSuggestionMenuField
- suggestionMenuOptionId

## ./utils/blockDrag

`./dist/utils/blockDrag.d.ts`

### function

- resolveDragBlockIds

## ./utils/editorInteractionModel

`./dist/utils/editorInteractionModel.d.ts`

### function

- isRepeatedCellSelection
- resolveBlockPointerIntent

### type

- BlockPointerIntent
- PointerCellCoord
- PointerInteractionModel

## ./utils/inlineAtomSelection

`./dist/utils/inlineAtomSelection.d.ts`

### function

- isInlineAtomSelected

## ./utils/pointerSelection

`./dist/utils/pointerSelection.d.ts`

### function

- createPointerSelectionGesture
- resolvePointerDragSelection
- resolvePointerGestureAnchorPoint

### type

- PointerSelectionGesture
- ResolvedPointerDragSelection
