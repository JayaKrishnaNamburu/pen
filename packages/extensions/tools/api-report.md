# @input/pen-tools

## .

`./dist/index.d.ts`

### class

- ToolContextImpl
- ToolRuntimeImpl

### function

- applyValidatedOps
- assertToolCanMutateBlock
- assertToolCanUseBlockType
- assertValidToolPayloads
- buildCursorContext
- buildDocumentBlockSnapshots
- editDocumentTool
- executeEditDocument
- exportDocumentRangeAsMarkdown
- formatBlocksAsAnnotatedMarkdown
- formatBlocksAsMarkdown
- getDocumentToolRuntime
- inspectStructuredTarget
- listAvailableToolBlockTypes
- listDocumentBlockHandles
- listValidOperationsForTarget
- normalizeContextToolOptions
- planEditDocument
- resolveDocumentBlockHandles
- resolveDocumentBlocks
- resolveSelectedText
- resolveSelectionText
- retrieveDocumentSpans
- stripBlockAnnotations
- summarizeBlocks
- toolsExtension
- validateToolPayloads

### guard

- isDocumentOpType

### value

- buildDocumentWriteOps
- BuildDocumentWriteOpsOptions
- BuildDocumentWriteOpsResult
- DOCUMENT_OP_TYPES
- DocumentWriteBlockInput
- DocumentWriteFormat
- EDIT_DOCUMENT_OPERATIONS
- INVALID_TOOL_PAYLOAD_CODE
- MAX_OP_TEXT_FIELD_LENGTH
- STRUCTURED_TARGET_OPERATION_IDS

### type

- DocumentBlockSnapshot
- EditDocumentCompiledOp
- EditDocumentOperation
- EditDocumentOperationInput
- EditDocumentOutlineEntry
- EditDocumentPlan
- EditDocumentRejection
- EditDocumentResult
- ExecuteEditDocumentOptions
- RetrievedDocumentSpan
- RetrieveDocumentSpansInput
- StructuredTargetInspection
- StructuredTargetOperationId
- StructuredTargetSchemaSnapshot
- ToolBlockTypeEntry
- ToolPayloadFailure
- ToolPayloadValidationResult
