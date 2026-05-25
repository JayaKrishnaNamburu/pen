import type { Editor, ModelRequestedOperation } from "@pen/types";
import {
	isScopedSelectionTarget,
	renderSelectionTargetText,
	resolveSelectionTargetBlockIds,
} from "@pen/types";

export function parseRequestedOperation(
	value: unknown,
): ModelRequestedOperation | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as ModelRequestedOperation;
	if (
		candidate.kind !== "rewrite-selection" &&
		candidate.kind !== "rewrite-block" &&
		candidate.kind !== "continue-block" &&
		candidate.kind !== "document-transform"
	) {
		return null;
	}
	if (
		candidate.applyPolicy !== "selection-replace" &&
		candidate.applyPolicy !== "block-replace" &&
		candidate.applyPolicy !== "block-continue" &&
		candidate.applyPolicy !== "document-review"
	) {
		return null;
	}
	if (!candidate.target || typeof candidate.target !== "object") {
		return null;
	}
	if (
		candidate.target.kind === "selection" ||
		candidate.target.kind === "scoped-range"
	) {
		return (candidate.target.blockId == null ||
			typeof candidate.target.blockId === "string") &&
			typeof candidate.target.anchor?.blockId === "string" &&
			typeof candidate.target.anchor?.offset === "number" &&
			typeof candidate.target.focus?.blockId === "string" &&
			typeof candidate.target.focus?.offset === "number" &&
			typeof candidate.target.sourceText === "string" &&
			(candidate.target.kind !== "scoped-range" ||
				(Array.isArray(candidate.target.blockIds) &&
					candidate.target.blockIds.every(
						(blockId) => typeof blockId === "string",
					) &&
					(candidate.target.contentFormat === "text" ||
						candidate.target.contentFormat === "markdown") &&
					(candidate.target.scope === "block" ||
						candidate.target.scope === "paragraph" ||
						candidate.target.scope === "document" ||
						candidate.target.scope === "heading")))
			? candidate
			: null;
	}
	if (candidate.target.kind === "block") {
		return typeof candidate.target.blockId === "string" &&
			typeof candidate.target.sourceText === "string"
			? candidate
			: null;
	}
	if (candidate.target.kind === "document") {
		return (candidate.target.blockIds === undefined ||
			(Array.isArray(candidate.target.blockIds) &&
				candidate.target.blockIds.every(
					(blockId) => typeof blockId === "string",
				))) &&
			(candidate.target.placement === undefined ||
				candidate.target.placement === "append-after-block" ||
				candidate.target.placement === "replace-empty-block" ||
				candidate.target.placement === "replace-blocks") &&
			(candidate.target.transform === undefined ||
				candidate.target.transform === "write" ||
				candidate.target.transform === "rewrite" ||
				candidate.target.transform === "remove")
			? candidate
			: null;
	}
	return null;
}

export function resolveLocalOperationFrameType(
	operation: ModelRequestedOperation,
	phase: "preview" | "final",
): "replace-preview" | "replace-final" | "insert-preview" | "insert-final" {
	if (
		operation.kind === "continue-block" ||
		(operation.kind === "document-transform" &&
			operation.target.kind === "document" &&
			operation.target.placement === "append-after-block")
	) {
		return phase === "preview" ? "insert-preview" : "insert-final";
	}
	return phase === "preview" ? "replace-preview" : "replace-final";
}

export function resolveDocumentTransformTargetBlockIds(
	editor: Editor,
	target: Extract<ModelRequestedOperation["target"], { kind: "document" }>,
): string[] {
	const requestedBlockIds =
		target.blockIds?.filter(
			(blockId) => editor.getBlock(blockId) != null,
		) ?? [];
	if (requestedBlockIds.length > 0) {
		return requestedBlockIds;
	}
	if (target.activeBlockId && editor.getBlock(target.activeBlockId)) {
		return [target.activeBlockId];
	}
	return editor.documentState.blockOrder.filter(
		(blockId) => editor.getBlock(blockId) != null,
	);
}

export function remapRequestedOperationBlockIds(
	operation: ModelRequestedOperation,
	clientToServerBlockIds: ReadonlyMap<string, string>,
): ModelRequestedOperation {
	const remapBlockId = (blockId: string | null | undefined): string | null =>
		blockId == null
			? null
			: (clientToServerBlockIds.get(blockId) ?? blockId);
	if (
		operation.target.kind === "selection" ||
		operation.target.kind === "scoped-range"
	) {
		return {
			...operation,
			target: {
				...operation.target,
				blockId: remapBlockId(operation.target.blockId),
				...(operation.target.kind === "scoped-range"
					? {
							blockIds: operation.target.blockIds.map(
								(blockId) =>
									clientToServerBlockIds.get(blockId) ??
									blockId,
							),
						}
					: {}),
				anchor: {
					...operation.target.anchor,
					blockId:
						clientToServerBlockIds.get(
							operation.target.anchor.blockId,
						) ?? operation.target.anchor.blockId,
				},
				focus: {
					...operation.target.focus,
					blockId:
						clientToServerBlockIds.get(
							operation.target.focus.blockId,
						) ?? operation.target.focus.blockId,
				},
			},
		};
	}
	if (operation.target.kind === "block") {
		return {
			...operation,
			target: {
				...operation.target,
				blockId:
					clientToServerBlockIds.get(operation.target.blockId) ??
					operation.target.blockId,
			},
		};
	}
	return {
		...operation,
		target: {
			...operation.target,
			activeBlockId: remapBlockId(operation.target.activeBlockId),
			blockIds: operation.target.blockIds?.map(
				(blockId) => clientToServerBlockIds.get(blockId) ?? blockId,
			),
		},
	};
}

export function resolveRequestedOperationConflict(
	editor: Editor,
	operation: ModelRequestedOperation,
	options?: {
		allowSelectionTextMismatch?: boolean;
	},
): string | null {
	if (
		operation.target.kind === "selection" ||
		operation.target.kind === "scoped-range"
	) {
		const target = operation.target;
		const targetBlockIds = resolveSelectionTargetBlockIds(editor, target);
		if (targetBlockIds.length === 0) {
			return "The selected range no longer exists.";
		}
		if (
			isScopedSelectionTarget(target) &&
			operation.provenance?.syncedGeneration != null &&
			operation.provenance.syncedGeneration >= 0 &&
			editor.documentState.generation !==
				operation.provenance.syncedGeneration
		) {
			return "The document changed before the operation started.";
		}
		const currentText = renderSelectionTargetText(editor, target, {
			resolved: true,
		});
		if (options?.allowSelectionTextMismatch) {
			return null;
		}
		if (currentText === operation.target.sourceText) {
			return null;
		}
		return "The selected text changed before the operation started.";
	}
	if (operation.target.kind === "block") {
		const block = editor.getBlock(operation.target.blockId);
		if (!block) {
			return "The target block no longer exists.";
		}
		if (
			operation.provenance?.blockRevision != null &&
			editor.getBlockRevision(operation.target.blockId) !==
				operation.provenance.blockRevision
		) {
			return "The target block changed before the operation started.";
		}
	}
	if (
		operation.target.kind === "document" &&
		operation.provenance?.syncedGeneration != null &&
		operation.provenance.syncedGeneration >= 0 &&
		editor.documentState.generation !==
			operation.provenance.syncedGeneration
	) {
		return "The document changed before the operation started.";
	}
	return null;
}
