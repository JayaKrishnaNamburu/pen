import { describe, expect, it } from "vitest";
import {
	blocksToOps as blocksToOpsFromCore,
	createImportResult as createImportResultFromCore,
	filterPendingBlocksForDocumentProfile as filterPendingBlocksForDocumentProfileFromCore,
	getBlockSelectionRoleFromSchema as getBlockSelectionRoleFromSchemaFromCore,
	getBlockSelectionRoleFromType as getBlockSelectionRoleFromTypeFromCore,
	getFlowCapabilityFromSchema as getFlowCapabilityFromSchemaFromCore,
	getFlowCapabilityFromType as getFlowCapabilityFromTypeFromCore,
	isContinuousTextFlowCapability as isContinuousTextFlowCapabilityFromCore,
	normalizePendingBlocksForImport as normalizePendingBlocksForImportFromCore,
	reportPendingBlockImportViolations as reportPendingBlockImportViolationsFromCore,
	reportPendingBlockProfileViolations as reportPendingBlockProfileViolationsFromCore,
	shouldAllowDirectBlockPaste as shouldAllowDirectBlockPasteFromCore,
	shouldAllowFlowInsertionInSlashMenu as shouldAllowFlowInsertionInSlashMenuFromCore,
	shouldExposeBlockInTooling as shouldExposeBlockInToolingFromCore,
	shouldFallbackMixedSelectionToBlock as shouldFallbackMixedSelectionToBlockFromCore,
	shouldForceBlockScopedSelectAll as shouldForceBlockScopedSelectAllFromCore,
	shouldShowBlockInDefaultMenus as shouldShowBlockInDefaultMenusFromCore,
} from "@input/pen-core";
import {
	blocksToOps,
	createImportResult,
	filterPendingBlocksForDocumentProfile,
	getBlockSelectionRoleFromSchema,
	getBlockSelectionRoleFromType,
	getFlowCapabilityFromSchema,
	getFlowCapabilityFromType,
	isContinuousTextFlowCapability,
	normalizePendingBlocksForImport,
	reportPendingBlockImportViolations,
	reportPendingBlockProfileViolations,
	shouldAllowDirectBlockPaste,
	shouldAllowFlowInsertionInSlashMenu,
	shouldExposeBlockInTooling,
	shouldFallbackMixedSelectionToBlock,
	shouldForceBlockScopedSelectAll,
	shouldShowBlockInDefaultMenus,
} from "../index";

const REEXPORTS = [
	["blocksToOps", blocksToOps, blocksToOpsFromCore],
	["createImportResult", createImportResult, createImportResultFromCore],
	[
		"filterPendingBlocksForDocumentProfile",
		filterPendingBlocksForDocumentProfile,
		filterPendingBlocksForDocumentProfileFromCore,
	],
	[
		"getBlockSelectionRoleFromSchema",
		getBlockSelectionRoleFromSchema,
		getBlockSelectionRoleFromSchemaFromCore,
	],
	[
		"getBlockSelectionRoleFromType",
		getBlockSelectionRoleFromType,
		getBlockSelectionRoleFromTypeFromCore,
	],
	[
		"getFlowCapabilityFromSchema",
		getFlowCapabilityFromSchema,
		getFlowCapabilityFromSchemaFromCore,
	],
	[
		"getFlowCapabilityFromType",
		getFlowCapabilityFromType,
		getFlowCapabilityFromTypeFromCore,
	],
	[
		"isContinuousTextFlowCapability",
		isContinuousTextFlowCapability,
		isContinuousTextFlowCapabilityFromCore,
	],
	[
		"normalizePendingBlocksForImport",
		normalizePendingBlocksForImport,
		normalizePendingBlocksForImportFromCore,
	],
	[
		"reportPendingBlockImportViolations",
		reportPendingBlockImportViolations,
		reportPendingBlockImportViolationsFromCore,
	],
	[
		"reportPendingBlockProfileViolations",
		reportPendingBlockProfileViolations,
		reportPendingBlockProfileViolationsFromCore,
	],
	[
		"shouldAllowDirectBlockPaste",
		shouldAllowDirectBlockPaste,
		shouldAllowDirectBlockPasteFromCore,
	],
	[
		"shouldAllowFlowInsertionInSlashMenu",
		shouldAllowFlowInsertionInSlashMenu,
		shouldAllowFlowInsertionInSlashMenuFromCore,
	],
	[
		"shouldExposeBlockInTooling",
		shouldExposeBlockInTooling,
		shouldExposeBlockInToolingFromCore,
	],
	[
		"shouldFallbackMixedSelectionToBlock",
		shouldFallbackMixedSelectionToBlock,
		shouldFallbackMixedSelectionToBlockFromCore,
	],
	[
		"shouldForceBlockScopedSelectAll",
		shouldForceBlockScopedSelectAll,
		shouldForceBlockScopedSelectAllFromCore,
	],
	[
		"shouldShowBlockInDefaultMenus",
		shouldShowBlockInDefaultMenus,
		shouldShowBlockInDefaultMenusFromCore,
	],
] as const;

describe("content-ops re-exports the core helpers by identity", () => {
	it.each(REEXPORTS)("%s is the core function, not a local copy", (_name, fromPackage, fromCore) => {
		expect(fromPackage).toBe(fromCore);
	});
});
