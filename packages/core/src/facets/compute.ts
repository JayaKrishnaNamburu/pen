import type {
	Editor,
	FacetDependency,
	FacetSpec,
	Precedence,
} from "@input/pen-types";

import type { FacetProviderRecord } from "./defineFacet";

export interface OrderedFacetProvider {
	record: FacetProviderRecord;
	input: unknown;
	hasInput: boolean;
	extensionOrder: number;
	arrayIndex: number;
	precedence: Precedence;
}

export interface FacetSlot {
	spec: FacetSpec<unknown, unknown>;
	providers: OrderedFacetProvider[];
	output: unknown;
	hasOutput: boolean;
}

export interface FacetComputeState {
	editor: Editor | undefined;
	slots: Map<string, FacetSlot>;
	computedOrder: string[];
	dependents: Map<string, string[]>;
	lastCommitId: number | undefined;
	lastSelectionVersion: number | undefined;
}

export interface FacetSettleInput {
	readonly commitId?: number;
	readonly emptyCommit?: boolean;
	readonly selectionVersion?: number;
}

export function facetDepName(dep: FacetDependency): string | null {
	if (dep === "document" || dep === "selection") return null;
	return dep.name;
}

export function resolveAllFacets(state: FacetComputeState): void {
	for (const [name, slot] of state.slots) {
		if (slot.spec.static || !state.computedOrder.includes(name)) {
			resolveSlot(state, slot);
		}
	}
	for (const name of state.computedOrder) {
		const slot = state.slots.get(name);
		if (slot) resolveSlot(state, slot);
	}
}

/** Pipeline phase 7 (settle facets): recompute computed providers per R3. */
export function settleFacets(
	state: FacetComputeState,
	input: FacetSettleInput,
): void {
	const documentChanged =
		input.commitId !== undefined &&
		input.commitId !== state.lastCommitId &&
		input.emptyCommit !== true;
	const selectionChanged =
		input.selectionVersion !== undefined &&
		input.selectionVersion !== state.lastSelectionVersion;

	if (input.commitId !== undefined) state.lastCommitId = input.commitId;
	if (input.selectionVersion !== undefined) {
		state.lastSelectionVersion = input.selectionVersion;
	}

	if (!documentChanged && !selectionChanged) return;

	const changedFacets = new Set<string>();
	for (const name of state.computedOrder) {
		const slot = state.slots.get(name);
		if (!slot) continue;
		const outputChanged = settleSlot(
			state,
			slot,
			documentChanged,
			selectionChanged,
			changedFacets,
		);
		if (outputChanged) changedFacets.add(name);
	}
}

function resolveSlot(state: FacetComputeState, slot: FacetSlot): void {
	for (const provider of slot.providers) {
		provider.input = readProviderInput(state, provider);
		provider.hasInput = true;
	}
	slot.output = slot.spec.combine(collectInputs(slot));
	slot.hasOutput = true;
}

function settleSlot(
	state: FacetComputeState,
	slot: FacetSlot,
	documentChanged: boolean,
	selectionChanged: boolean,
	changedFacets: Set<string>,
): boolean {
	const compareInput = slot.spec.compareInput ?? Object.is;
	let inputsChanged = false;

	for (const provider of slot.providers) {
		if (
			!providerNeedsRecompute(
				provider,
				documentChanged,
				selectionChanged,
				changedFacets,
			)
		) {
			continue;
		}
		const next = readProviderInput(state, provider);
		if (provider.hasInput && compareInput(provider.input, next)) continue;
		provider.input = next;
		provider.hasInput = true;
		inputsChanged = true;
	}

	if (!inputsChanged) return false;

	const nextOutput = slot.spec.combine(collectInputs(slot));
	const compareOutput = slot.spec.compareOutput ?? Object.is;
	if (slot.hasOutput && compareOutput(slot.output, nextOutput)) return false;
	slot.output = nextOutput;
	slot.hasOutput = true;
	return true;
}

function providerNeedsRecompute(
	provider: OrderedFacetProvider,
	documentChanged: boolean,
	selectionChanged: boolean,
	changedFacets: Set<string>,
): boolean {
	if (provider.record.kind !== "computed") return false;
	for (const dep of provider.record.deps) {
		if (dep === "document" && documentChanged) return true;
		if (dep === "selection" && selectionChanged) return true;
		const name = facetDepName(dep);
		if (name && changedFacets.has(name)) return true;
	}
	return false;
}

function readProviderInput(
	state: FacetComputeState,
	provider: OrderedFacetProvider,
): unknown {
	const record = provider.record;
	switch (record.kind) {
		case "computed":
			return record.compute(state.editor as Editor);
		case "value":
			return record.value;
		default: {
			const _exhaustive: never = record;
			return _exhaustive;
		}
	}
}

function collectInputs(slot: FacetSlot): unknown[] {
	return slot.providers.map((provider) => provider.input);
}
