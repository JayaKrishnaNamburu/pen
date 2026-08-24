export {
	getBlockSelectionRoleFromSchema,
	getBlockSelectionRoleFromType,
	getFlowCapabilityFromSchema,
	getFlowCapabilityFromType,
	isContinuousTextFlowCapability,
	shouldAllowDirectBlockPaste,
	shouldAllowFlowInsertionInSlashMenu,
	shouldExposeBlockInTooling,
	shouldShowBlockInDefaultMenus,
	shouldForceBlockScopedSelectAll,
} from "./blockCapabilities";

export { blocksToOps } from "./blocks";
export type { ImportOptions, PendingBlock } from "./blocks";

export {
	createImportResult,
	filterPendingBlocksForDocumentProfile,
	normalizePendingBlocksForImport,
	reportPendingBlockImportViolations,
	reportPendingBlockProfileViolations,
} from "./profilePolicy";
export type {
	PendingBlockImportPolicyViolation,
	PendingBlockProfilePolicyViolation,
} from "./profilePolicy";

export { parseMarkdownToBlocks } from "./markdown";

export { splitPlainTextLineBlocks } from "./plainTextBlocks";

export { buildDocumentWriteOps } from "./writeContent";
export type {
	BuildDocumentWriteOpsOptions,
	BuildDocumentWriteOpsResult,
	DocumentWriteBlockInput,
	DocumentWriteFormat,
} from "./writeContent";

export type {
	StructuredTargetDescriptor,
	StructuredTargetKind,
	TargetEditability,
	BlockTargetDescriptor,
	TableTargetDescriptor,
} from "./plan/targets";

export { normalizePlanRecord, normalizePlanSteps } from "./plan/planSchemas";
export type { PlanRecord } from "./plan/planSchemas";
