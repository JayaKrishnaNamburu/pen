export {
	documentOpsExtension,
} from "./documentOpsExtension";
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
	formatBlocksAsMarkdown,
	listDocumentBlockHandles,
	normalizeContextToolOptions,
	resolveDocumentBlockHandles,
	resolveDocumentBlocks,
	resolveSelectedText,
	resolveSelectionText,
	summarizeBlocks,
} from "./utils/documentContext";
export {
	retrieveDocumentSpans,
} from "./utils/retrieveDocumentSpans";
export { assertToolCanMutateBlock } from "./utils/mutationPolicy";
export {
	STRUCTURED_TARGET_OPERATION_IDS,
	inspectStructuredTarget,
	listAvailableToolBlockTypes,
	listValidOperationsForTarget,
} from "./utils/structuredTargets";
export type {
	DocumentBlockSnapshot,
} from "./utils/documentContext";
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
export { buildDocumentWriteOps } from "@pen/content-ops";
export type {
	BuildDocumentWriteOpsOptions,
	BuildDocumentWriteOpsResult,
	DocumentWriteBlockInput,
	DocumentWriteFormat,
} from "@pen/content-ops";
