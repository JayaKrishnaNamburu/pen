import {
	getFlowCapabilityFromSchema,
	getFlowCapabilityFromType,
	type DocumentProfile,
	type Editor,
	type FlowBlockCapability,
	type ImportResult,
	type SchemaRegistry,
} from "@pen/types";
import type { PendingBlock } from "./blocks";

type ImportNormalizationEditor = {
	documentProfile: Editor["documentProfile"];
	internals: {
		emit: Editor["internals"]["emit"];
	};
};

export interface PendingBlockProfilePolicyViolation {
	readonly blockType: string;
	readonly documentProfile: DocumentProfile;
	readonly capability: FlowBlockCapability;
	readonly reason: "flow-disallowed-block";
}

export interface PendingBlockImportPolicyViolation {
	readonly blockType: string;
	readonly documentProfile: DocumentProfile;
	readonly capability: FlowBlockCapability | null;
	readonly reason: "flow-disallowed-block" | "unknown-block-type";
}

export function createImportResult(
	parsedTopLevelBlockCount: number,
	importedTopLevelBlockCount: number,
	violations: readonly Pick<PendingBlockImportPolicyViolation, "blockType">[],
): ImportResult {
	return {
		parsedTopLevelBlockCount,
		importedTopLevelBlockCount,
		droppedBlockCount: Math.max(
			0,
			parsedTopLevelBlockCount - importedTopLevelBlockCount,
		),
		droppedBlockTypes: [
			...new Set(violations.map((violation) => violation.blockType)),
		],
		normalized: violations.length > 0,
	};
}

export function normalizePendingBlocksForImport(
	blocks: readonly PendingBlock[],
	documentProfile: DocumentProfile,
	registry: SchemaRegistry,
): {
	readonly blocks: PendingBlock[];
	readonly violations: PendingBlockImportPolicyViolation[];
} {
	const allowedBlocks: PendingBlock[] = [];
	const violations: PendingBlockImportPolicyViolation[] = [];

	for (const block of blocks) {
		if (isInternalImportedBlockType(block.type)) {
			const childResult = block.children
				? normalizePendingBlocksForImport(block.children, documentProfile, registry)
				: null;
			if (childResult) {
				violations.push(...childResult.violations);
			}
			allowedBlocks.push(
				childResult ? { ...block, children: childResult.blocks } : block,
			);
			continue;
		}

		const schema = registry.resolve(block.type);
		if (!schema) {
			violations.push({
				blockType: block.type,
				documentProfile,
				capability: null,
				reason: "unknown-block-type",
			});
			continue;
		}

		const capability = getFlowCapabilityFromSchema(schema);
		if (documentProfile === "flow" && capability === "flow-disallowed") {
			violations.push({
				blockType: block.type,
				documentProfile,
				capability,
				reason: "flow-disallowed-block",
			});
			continue;
		}

		const childResult = block.children
			? normalizePendingBlocksForImport(block.children, documentProfile, registry)
			: null;
		if (childResult) {
			violations.push(...childResult.violations);
		}

		allowedBlocks.push(
			childResult ? { ...block, children: childResult.blocks } : block,
		);
	}

	return {
		blocks: allowedBlocks,
		violations,
	};
}

export function reportPendingBlockProfileViolations(
	editor: ImportNormalizationEditor,
	violations: readonly PendingBlockProfilePolicyViolation[],
	surface: string,
): void {
	if (violations.length === 0) {
		return;
	}

	const droppedBlockTypes = [
		...new Set(violations.map((violation) => violation.blockType)),
	];
	editor.internals.emit("diagnostic", {
		code: "PEN_PROFILE_002",
		level: "warn",
		source: "profile-policy",
		message:
			`profile-policy: dropped ${violations.length} imported block` +
			`${violations.length === 1 ? "" : "s"} during ${surface} normalization in ` +
			`${violations[0]!.documentProfile} documents`,
		remediation:
			"Import content supported by the active documentProfile or change the " +
			"documentProfile before importing structured content.",
		documentProfile: violations[0]!.documentProfile,
		droppedBlockTypes,
		surface,
		violations,
	});
}

export function filterPendingBlocksForDocumentProfile(
	blocks: readonly PendingBlock[],
	documentProfile: DocumentProfile,
	registry: SchemaRegistry,
): {
	readonly blocks: PendingBlock[];
	readonly violations: PendingBlockProfilePolicyViolation[];
} {
	if (documentProfile !== "flow") {
		return {
			blocks: [...blocks],
			violations: [],
		};
	}

	const allowedBlocks: PendingBlock[] = [];
	const violations: PendingBlockProfilePolicyViolation[] = [];

	for (const block of blocks) {
		const childResult = block.children
			? filterPendingBlocksForDocumentProfile(
					block.children,
					documentProfile,
					registry,
				)
			: null;

		if (childResult) {
			violations.push(...childResult.violations);
		}

		if (isInternalImportedBlockType(block.type)) {
			allowedBlocks.push(
				childResult ? { ...block, children: childResult.blocks } : block,
			);
			continue;
		}

		const capability = resolveBlockFlowCapability(registry, block.type);
		if (capability === "flow-disallowed") {
			violations.push({
				blockType: block.type,
				documentProfile,
				capability,
				reason: "flow-disallowed-block",
			});
			continue;
		}

		allowedBlocks.push(
			childResult ? { ...block, children: childResult.blocks } : block,
		);
	}

	return {
		blocks: allowedBlocks,
		violations,
	};
}

export function reportPendingBlockImportViolations(
	editor: ImportNormalizationEditor,
	violations: readonly PendingBlockImportPolicyViolation[],
	surface: string,
): void {
	if (violations.length === 0) {
		return;
	}

	const flowViolations = violations.filter(
		(violation): violation is PendingBlockProfilePolicyViolation =>
			violation.reason === "flow-disallowed-block" &&
			violation.capability === "flow-disallowed",
	);
	if (flowViolations.length > 0) {
		reportPendingBlockProfileViolations(editor, flowViolations, surface);
	}

	const unknownViolations = violations.filter(
		(violation) => violation.reason === "unknown-block-type",
	);
	if (unknownViolations.length === 0) {
		return;
	}

	const droppedBlockTypes = [
		...new Set(unknownViolations.map((violation) => violation.blockType)),
	];
	editor.internals.emit("diagnostic", {
		code: "PEN_IMPORT_001",
		level: "warn",
		source: "import-normalization",
		message:
			`import-normalization: dropped ${unknownViolations.length} imported block` +
			`${unknownViolations.length === 1 ? "" : "s"} during ${surface} normalization ` +
			"because their block types are not registered in the active schema",
		remediation:
			"Register the required block schemas/extensions before importing this " +
			"content, or transform unsupported blocks into supported types.",
		documentProfile: editor.documentProfile,
		droppedBlockTypes,
		surface,
		violations: unknownViolations,
	});
}

function resolveBlockFlowCapability(
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

function isInternalImportedBlockType(blockType: string): boolean {
	return blockType.startsWith("__table");
}
