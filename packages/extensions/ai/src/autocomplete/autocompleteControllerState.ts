import type { FieldEditor } from "@input/pen-types";
import type { AutocompleteControllerHost } from "./autocompleteControllerHost";
import {
	freezeProviderDescriptors,
	incrementPolicyInvalidationMetrics,
} from "./autocompleteControllerSnapshots";
import type { AutocompleteProviderDescriptor } from "./providers/types";
import type {
	AutocompleteBlockedReason,
	AutocompleteControllerState,
	AutocompletePolicyInvalidationStage,
} from "./types";
import { dismiss } from "./autocompleteControllerLifecycle";
import { getFieldEditor } from "./autocompleteControllerRequest";

export function setBlockedReason(
	controller: AutocompleteControllerHost,
	reason: AutocompleteBlockedReason,
): void {
	setState(controller, {
		diagnostics: {
			...controller._state.diagnostics,
			lastBlockedReason: reason,
		},
	});
}

export function recordPolicyInvalidation(
	controller: AutocompleteControllerHost,
	policyFailure: AutocompleteBlockedReason,
	invalidationStage: AutocompletePolicyInvalidationStage | null,
): void {
	setBlockedReason(controller, policyFailure);
	if (invalidationStage) {
		setState(controller, {
			metrics: incrementPolicyInvalidationMetrics(
				controller._state.metrics,
				invalidationStage,
			),
			diagnostics: {
				...controller._state.diagnostics,
				lastPolicyInvalidationStage: invalidationStage,
			},
		});
	}
	if (
		invalidationStage ||
		controller._continuation.hasPrefetchedContinuation
	) {
		dismiss(controller, "policy-change");
	}
}

export function invalidateForPolicyChange(
	controller: AutocompleteControllerHost,
): void {
	const activeBlockId =
		controller._continuation.sequence?.blockId ??
		getActiveSelectionBlockId(controller);
	if (!activeBlockId) {
		return;
	}
	const policyFailure = resolveCurrentBlockFailure(controller, activeBlockId);
	if (!policyFailure) {
		return;
	}
	const invalidationStage = getPolicyInvalidationStage(controller);
	recordPolicyInvalidation(controller, policyFailure, invalidationStage);
}

function getActiveSelectionBlockId(
	controller: AutocompleteControllerHost,
): string | null {
	const selection = controller._editor.selection;
	return selection?.type === "text" ? selection.focus.blockId : null;
}

function getPolicyInvalidationStage(
	controller: AutocompleteControllerHost,
): AutocompletePolicyInvalidationStage | null {
	if (
		controller._state.status === "scheduled" ||
		controller._state.status === "requesting"
	) {
		return controller._state.status;
	}
	if (
		controller._state.status === "showing" ||
		controller._continuation.sequence ||
		controller._continuation.hasPrefetchedContinuation
	) {
		return "showing";
	}
	return null;
}

export function resolveCurrentBlockFailure(
	controller: AutocompleteControllerHost,
	blockId: string,
): AutocompleteBlockedReason | null {
	const block = controller._editor.getBlock(blockId);
	if (!block) {
		return "block-missing";
	}
	return resolveContextEligibilityFailure(controller, block.id, block.type);
}

export function resolveContextEligibilityFailure(
	controller: AutocompleteControllerHost,
	blockId: string,
	blockType: string | null,
): AutocompleteBlockedReason | null {
	const blockPolicyFailure = resolveBlockPolicyFailure(controller, blockType);
	if (blockPolicyFailure) {
		return blockPolicyFailure;
	}
	const fieldEditor = getFieldEditor(controller) as
		| (FieldEditor & { activeCellCoord?: { blockId: string } | null })
		| null;
	if (
		fieldEditor?.activeCellCoord &&
		fieldEditor.activeCellCoord.blockId === blockId &&
		controller._state.blockPolicy.allowInTables !== true
	) {
		return "table-cell-active";
	}
	return null;
}

function resolveBlockPolicyFailure(
	controller: AutocompleteControllerHost,
	blockType: string | null,
): AutocompleteBlockedReason | null {
	if (!blockType) {
		return null;
	}
	const allowedBlockTypes = controller._state.blockPolicy.allowedBlockTypes;
	if (
		allowedBlockTypes &&
		allowedBlockTypes.length > 0 &&
		!allowedBlockTypes.includes(blockType)
	) {
		return "block-type-not-allowed";
	}
	const deniedBlockTypes = controller._state.blockPolicy.deniedBlockTypes;
	if (deniedBlockTypes?.includes(blockType)) {
		return "block-type-denied";
	}
	if (
		blockType === "codeBlock" &&
		controller._state.blockPolicy.allowInCodeBlocks === false
	) {
		return "code-block-disabled";
	}
	if (
		blockType === "table" &&
		controller._state.blockPolicy.allowInTables !== true
	) {
		return "table-disabled";
	}
	return null;
}

export function clearDebounceTimer(
	controller: AutocompleteControllerHost,
): void {
	if (controller._debounceTimer !== null) {
		clearTimeout(controller._debounceTimer);
		controller._debounceTimer = null;
	}
}

export function setState(
	controller: AutocompleteControllerHost,
	next: Partial<AutocompleteControllerState>,
): void {
	controller._state = {
		...controller._state,
		...next,
	};
	invalidateSnapshot(controller);
	emit(controller);
}

export function getProviderDescriptorsSnapshot(
	controller: AutocompleteControllerHost,
): readonly AutocompleteProviderDescriptor[] {
	if (controller._providerDescriptorsSnapshot === null) {
		controller._providerDescriptorsSnapshot = freezeProviderDescriptors(
			controller._providerRegistry.listProviderDescriptors(),
		);
	}
	return controller._providerDescriptorsSnapshot;
}

export function invalidateSnapshot(
	controller: AutocompleteControllerHost,
): void {
	controller._snapshot = null;
}

export function invalidateProviderDescriptorsSnapshot(
	controller: AutocompleteControllerHost,
): void {
	controller._providerDescriptorsSnapshot = null;
	invalidateSnapshot(controller);
}

export function emit(controller: AutocompleteControllerHost): void {
	for (const listener of controller._listeners) {
		listener();
	}
}
