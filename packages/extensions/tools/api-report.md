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
- exportDocumentRangeAsMarkdown
- formatBlocksAsAnnotatedMarkdown
- formatBlocksAsMarkdown
- getDocumentToolRuntime
- inspectStructuredTarget
- listAvailableToolBlockTypes
- listDocumentBlockHandles
- listValidOperationsForTarget
- normalizeContextToolOptions
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
- INVALID_TOOL_PAYLOAD_CODE
- MAX_OP_TEXT_FIELD_LENGTH
- STRUCTURED_TARGET_OPERATION_IDS

### type

- DocumentBlockSnapshot
- RetrievedDocumentSpan
- RetrieveDocumentSpansInput
- StructuredTargetInspection
- StructuredTargetOperationId
- StructuredTargetSchemaSnapshot
- ToolBlockTypeEntry
- ToolPayloadFailure
- ToolPayloadValidationResult
