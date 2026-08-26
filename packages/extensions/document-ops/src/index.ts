export { documentOpsExtension } from "./documentOpsExtension";
export type { DocumentOpsOptions } from "./documentOpsExtension";

// Low-level entrypoints for the default document tool runtime.
export { DOCUMENT_OPS_TOOL_RUNTIME_SLOT } from "./constants/toolServer";
export { getDocumentToolRuntime } from "./utils/toolServer";
export { assertToolCanUseBlockType } from "./utils/blockTypePolicy";

// Advanced APIs for custom execution flows and transports.
export { ToolRuntimeImpl } from "./toolServer";
export { ToolContextImpl } from "./toolContext";
export {
	buildCursorContext,
	buildDocumentBlockSnapshots,
	exportDocumentRangeAsMarkdown,
	formatBlocksAsAnnotatedMarkdown,
	formatBlocksAsMarkdown,
	listDocumentBlockHandles,
	normalizeContextToolOptions,
	resolveDocumentBlockHandles,
	resolveDocumentBlocks,
	resolveSelectedText,
	resolveSelectionText,
	stripBlockAnnotations,
	summarizeBlocks,
} from "./utils/documentContext";
export { retrieveDocumentSpans } from "./utils/retrieveDocumentSpans";
export { assertToolCanMutateBlock } from "./utils/mutationPolicy";
export {
	DOCUMENT_OP_TYPES,
	INVALID_TOOL_PAYLOAD_CODE,
	MAX_OP_TEXT_FIELD_LENGTH,
	isDocumentOpType,
} from "./constants/payloadValidation";
export {
	applyValidatedOps,
	assertValidToolPayloads,
	validateToolPayloads,
} from "./utils/payloadValidation";
export type {
	ToolPayloadFailure,
	ToolPayloadValidationResult,
} from "./utils/payloadValidation";
export {
	STRUCTURED_TARGET_OPERATION_IDS,
	inspectStructuredTarget,
	listAvailableToolBlockTypes,
	listValidOperationsForTarget,
} from "./utils/structuredTargets";
export type { DocumentBlockSnapshot } from "./utils/documentContext";
export type {
	RetrievedDocumentSpan,
	RetrieveDocumentSpansInput,
} from "./utils/retrieveDocumentSpans";
export type {
	StructuredTargetInspection,
	StructuredTargetOperationId,
	StructuredTargetSchemaSnapshot,
	ToolBlockTypeEntry,
} from "./utils/structuredTargets";
export { buildDocumentWriteOps } from "@input/pen-content-ops";
export type {
	BuildDocumentWriteOpsOptions,
	BuildDocumentWriteOpsResult,
	DocumentWriteBlockInput,
	DocumentWriteFormat,
} from "@input/pen-content-ops";
