import type { AutocompleteBlockPolicy, AutocompleteControllerSnapshot, AutocompleteControllerState, AutocompletePolicyInvalidationStage } from "./types";
import type { AutocompleteProviderDescriptor } from "./providers/types";

export function areBlockPoliciesEqual(
	left: AutocompleteBlockPolicy,
	right: AutocompleteBlockPolicy,
): boolean {
	return (
		left.allowInCodeBlocks === right.allowInCodeBlocks &&
		left.allowInTables === right.allowInTables &&
		areStringArraysEqual(left.allowedBlockTypes, right.allowedBlockTypes) &&
		areStringArraysEqual(left.deniedBlockTypes, right.deniedBlockTypes)
	);
}

function areStringArraysEqual(
	left: readonly string[] | undefined,
	right: readonly string[] | undefined,
): boolean {
	if (left === right) {
		return true;
	}
	if (!left || !right || left.length !== right.length) {
		return false;
	}
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) {
			return false;
		}
	}
	return true;
}

function cloneBlockPolicy(
	policy: AutocompleteBlockPolicy,
): AutocompleteBlockPolicy {
	return {
		allowInCodeBlocks: policy.allowInCodeBlocks,
		allowInTables: policy.allowInTables,
		allowedBlockTypes: policy.allowedBlockTypes
			? [...policy.allowedBlockTypes]
			: undefined,
		deniedBlockTypes: policy.deniedBlockTypes
			? [...policy.deniedBlockTypes]
			: undefined,
	};
}

export function cloneAutocompleteControllerState(
	state: AutocompleteControllerState,
): AutocompleteControllerState {
	return {
		enabled: state.enabled,
		status: state.status,
		activeRequestId: state.activeRequestId,
		visibleSuggestionId: state.visibleSuggestionId,
		settings: { ...state.settings },
		blockPolicy: cloneBlockPolicy(state.blockPolicy),
		metrics: { ...state.metrics },
		providerTimings: state.providerTimings.map((timing) => ({ ...timing })),
		diagnostics: { ...state.diagnostics },
	};
}

function freezeBlockPolicy(
	policy: AutocompleteBlockPolicy,
): AutocompleteBlockPolicy {
	if (policy.allowedBlockTypes) {
		Object.freeze(policy.allowedBlockTypes);
	}
	if (policy.deniedBlockTypes) {
		Object.freeze(policy.deniedBlockTypes);
	}
	return Object.freeze(policy);
}

export function freezeAutocompleteControllerState(
	state: AutocompleteControllerState,
): AutocompleteControllerState {
	Object.freeze(state.settings);
	freezeBlockPolicy(state.blockPolicy);
	Object.freeze(state.metrics);
	for (const timing of state.providerTimings) {
		Object.freeze(timing);
	}
	Object.freeze(state.providerTimings);
	Object.freeze(state.diagnostics);
	return Object.freeze(state);
}

export function freezeProviderDescriptors(
	descriptors: readonly AutocompleteProviderDescriptor[],
): readonly AutocompleteProviderDescriptor[] {
	for (const descriptor of descriptors) {
		Object.freeze(descriptor);
	}
	return Object.freeze([...descriptors]);
}

export function freezeAutocompleteControllerSnapshot(
	snapshot: AutocompleteControllerSnapshot,
): AutocompleteControllerSnapshot {
	return Object.freeze(snapshot);
}

export function incrementPolicyInvalidationMetrics(
	metrics: AutocompleteControllerState["metrics"],
	stage: AutocompletePolicyInvalidationStage,
): AutocompleteControllerState["metrics"] {
	return {
		...metrics,
		policyInvalidationScheduledCount:
			metrics.policyInvalidationScheduledCount +
			(stage === "scheduled" ? 1 : 0),
		policyInvalidationRequestingCount:
			metrics.policyInvalidationRequestingCount +
			(stage === "requesting" ? 1 : 0),
		policyInvalidationShowingCount:
			metrics.policyInvalidationShowingCount +
			(stage === "showing" ? 1 : 0),
	};
}
