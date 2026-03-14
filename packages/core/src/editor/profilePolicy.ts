import {
	getFlowCapabilityFromSchema,
	getFlowCapabilityFromType,
	isContinuousTextFlowCapability as isSharedContinuousTextFlowCapability,
	shouldAllowDirectBlockPaste as shouldAllowSharedDirectBlockPaste,
	shouldAllowFlowInsertionInSlashMenu as shouldAllowSharedFlowInsertionInSlashMenu,
	shouldFallbackMixedSelectionToBlock as shouldFallbackSharedMixedSelectionToBlock,
	shouldForceBlockScopedSelectAll as shouldForceSharedBlockScopedSelectAll,
	type ConvertBlockOp,
	type DocumentOp,
	type DocumentProfile,
	type FlowBlockCapability,
	type InsertBlockOp,
	type SchemaRegistry,
	type SplitBlockOp,
} from "@pen/types";
import type {
	PendingBlockImportPolicyViolation,
	PendingBlockProfilePolicyViolation,
} from "@pen/content-ops";
export {
	createImportResult,
	filterPendingBlocksForDocumentProfile,
	normalizePendingBlocksForImport,
	reportPendingBlockImportViolations,
	reportPendingBlockProfileViolations,
} from "@pen/content-ops";
export type {
	PendingBlockImportPolicyViolation,
	PendingBlockProfilePolicyViolation,
} from "@pen/content-ops";

export function resolveBlockFlowCapability(
	registry: SchemaRegistry,
	blockType: string | null | undefined,
): FlowBlockCapability | null {
	if (!blockType) {
		return null;
	}

	return (
		getFlowCapabilityFromSchema(registry.resolve(blockType)) ??
		getFlowCapabilityFromType(blockType)
	);
}

export function shouldFallbackMixedSelectionToBlock(
	documentProfile: DocumentProfile,
	capability: FlowBlockCapability | null,
): boolean {
	return shouldFallbackSharedMixedSelectionToBlock(documentProfile, capability);
}

export function shouldForceBlockScopedSelectAll(
	documentProfile: DocumentProfile,
	capability: FlowBlockCapability | null,
): boolean {
	return shouldForceSharedBlockScopedSelectAll(documentProfile, capability);
}

export function isContinuousTextFlowCapability(
	capability: FlowBlockCapability | null,
): boolean {
	return isSharedContinuousTextFlowCapability(capability);
}

export function shouldAllowFlowInsertionInSlashMenu(
	documentProfile: DocumentProfile,
	capability: FlowBlockCapability | null,
): boolean {
	return shouldAllowSharedFlowInsertionInSlashMenu(documentProfile, capability);
}

export function shouldAllowDirectBlockPaste(
	documentProfile: DocumentProfile,
	capability: FlowBlockCapability | null,
): boolean {
	return shouldAllowSharedDirectBlockPaste(documentProfile, capability);
}

export interface ProfilePolicyViolation {
	readonly op: InsertBlockOp | ConvertBlockOp | SplitBlockOp;
	readonly blockType: string;
	readonly documentProfile: DocumentProfile;
	readonly capability: FlowBlockCapability;
	readonly reason: "flow-disallowed-block";
}

function getProfileControlledBlockType(
	op: DocumentOp,
): string | null {
	switch (op.type) {
		case "insert-block":
			return op.blockType;
		case "convert-block":
			return op.newType;
		case "split-block":
			return op.newBlockType ?? null;
		default:
			return null;
	}
}

function isProfileControlledOp(
	op: DocumentOp,
): op is InsertBlockOp | ConvertBlockOp | SplitBlockOp {
	return (
		op.type === "insert-block" ||
		op.type === "convert-block" ||
		op.type === "split-block"
	);
}

export function filterOpsForDocumentProfile(
	ops: readonly DocumentOp[],
	documentProfile: DocumentProfile,
	registry: SchemaRegistry,
): {
	readonly ops: DocumentOp[];
	readonly violations: ProfilePolicyViolation[];
} {
	if (documentProfile !== "flow") {
		return {
			ops: [...ops],
			violations: [],
		};
	}

	const allowedOps: DocumentOp[] = [];
	const violations: ProfilePolicyViolation[] = [];

	for (const op of ops) {
		if (!isProfileControlledOp(op)) {
			allowedOps.push(op);
			continue;
		}

		const blockType = getProfileControlledBlockType(op);
		const capability = resolveBlockFlowCapability(registry, blockType);

		if (capability === "flow-disallowed" && blockType) {
			violations.push({
				op,
				blockType,
				documentProfile,
				capability,
				reason: "flow-disallowed-block",
			});
			continue;
		}

		allowedOps.push(op);
	}

	return {
		ops: allowedOps,
		violations,
	};
}
