import type {
	AIStreamEvent,
	GenerationStructuredPreviewState,
	StructuredPreviewPatchOperation,
} from "@pen/ai";

export interface AIStructuredPreviewSelection {
	preview: GenerationStructuredPreviewState | null;
	patchCount: number;
}

export type AIStructuredPreviewTargetState =
	GenerationStructuredPreviewState["targets"][number];

export type AIStructuredPreviewContentItem =
	| {
			kind: "block";
			blockId: string;
	  }
	| {
			kind: "virtual-target";
			target: AIStructuredPreviewTargetState;
			planState: GenerationStructuredPreviewState["planState"];
	  };

export function buildAIStructuredPreviewSelection(
	streamEvents: readonly AIStreamEvent[],
	generationId: string | null,
	fallbackPreview: GenerationStructuredPreviewState | null,
): AIStructuredPreviewSelection {
	if (!generationId) {
		return {
			preview: fallbackPreview,
			patchCount: 0,
		};
	}

	let previewDocument: unknown = {};
	let hasPatchedPreview = false;
	let patchCount = 0;
	let latestPreviewSnapshot: GenerationStructuredPreviewState | null = fallbackPreview;

	for (const event of streamEvents) {
		if (
			event.type !== "structured-preview" ||
			event.generationId !== generationId
		) {
			continue;
		}

		latestPreviewSnapshot = event.preview;
		patchCount = event.patches.length;
		try {
			previewDocument = applyStructuredPreviewPatchOperations(
				hasPatchedPreview ? previewDocument : {},
				event.patches,
			);
			hasPatchedPreview = true;
		} catch {
			return {
				preview: latestPreviewSnapshot,
				patchCount,
			};
		}
	}

	if (!hasPatchedPreview) {
		return {
			preview: fallbackPreview,
			patchCount: 0,
		};
	}

	return {
		preview: isGenerationStructuredPreviewState(previewDocument)
			? previewDocument
			: latestPreviewSnapshot,
		patchCount,
	};
}

export function areAIStructuredPreviewSelectionsEqual(
	previous: AIStructuredPreviewSelection,
	next: AIStructuredPreviewSelection,
): boolean {
	return (
		previous.patchCount === next.patchCount &&
		areStructuredPreviewValuesEqual(previous.preview, next.preview)
	);
}

export function buildAIStructuredPreviewContentItems(
	blockIds: readonly string[],
	preview: GenerationStructuredPreviewState | null,
): AIStructuredPreviewContentItem[] {
	const contentItems: AIStructuredPreviewContentItem[] = [];
	if (!preview) {
		for (const blockId of blockIds) {
			contentItems.push({ kind: "block", blockId });
		}
		return contentItems;
	}

	const existingBlockIds = new Set(blockIds);
	const virtualTargetById = new Map<string, AIStructuredPreviewTargetState>();
	for (const target of preview.targets) {
		if (!existingBlockIds.has(target.blockId)) {
			virtualTargetById.set(target.blockId, target);
		}
	}

	const orderedIds = [...blockIds];
	const blockInsertPlans: Array<
		Extract<GenerationStructuredPreviewState["plan"], { kind: "block_insert" }>
	> = [];
	appendBlockInsertPlans(preview.plan, blockInsertPlans);

	for (const plan of blockInsertPlans) {
		if (!plan.blockId) {
			continue;
		}
		if (!virtualTargetById.has(plan.blockId)) {
			continue;
		}
		insertStructuredPreviewBlockId(orderedIds, plan.blockId, plan.position);
	}

	for (const blockId of orderedIds) {
		const virtualTarget = virtualTargetById.get(blockId);
		if (virtualTarget) {
			contentItems.push({
				kind: "virtual-target",
				target: virtualTarget,
				planState: preview.planState,
			});
			continue;
		}
		contentItems.push({ kind: "block", blockId });
	}

	return contentItems;
}

function applyStructuredPreviewPatchOperations(
	base: unknown,
	patches: readonly StructuredPreviewPatchOperation[],
): unknown {
	let nextValue = cloneStructuredValue(base);
	for (const patch of patches) {
		nextValue = applyStructuredPreviewPatchOperation(nextValue, patch);
	}
	return nextValue;
}

function applyStructuredPreviewPatchOperation(
	base: unknown,
	patch: StructuredPreviewPatchOperation,
): unknown {
	const pathSegments = parseJsonPointerPath(patch.path);
	if (pathSegments.length === 0) {
		return patch.op === "remove"
			? null
			: cloneStructuredValue(patch.value);
	}

	const root = isContainerValue(base)
		? cloneContainer(base)
		: createContainerForSegment(pathSegments[0]);
	let cursor: Record<string, unknown> | unknown[] = root;

	for (let index = 0; index < pathSegments.length - 1; index += 1) {
		const segment = pathSegments[index];
		const nextSegment = pathSegments[index + 1];
		const currentChild = readContainerValue(cursor, segment);
		const nextChild = isContainerValue(currentChild)
			? cloneContainer(currentChild)
			: createContainerForSegment(nextSegment);
		writeContainerValue(cursor, segment, nextChild);
		cursor = nextChild;
	}

	const finalSegment = pathSegments[pathSegments.length - 1];
	if (patch.op === "remove") {
		removeContainerValue(cursor, finalSegment);
		return root;
	}

	writeContainerValue(cursor, finalSegment, cloneStructuredValue(patch.value));
	return root;
}

function appendBlockInsertPlans(
	plan: GenerationStructuredPreviewState["plan"],
	output: Array<
		Extract<GenerationStructuredPreviewState["plan"], { kind: "block_insert" }>
	>,
): void {
	if (plan.kind === "review_bundle") {
		for (const nestedPlan of plan.plans) {
			appendBlockInsertPlans(nestedPlan, output);
		}
		return;
	}

	if (plan.kind === "block_insert") {
		output.push(plan);
	}
}

function insertStructuredPreviewBlockId(
	orderedIds: string[],
	blockId: string,
	position: Extract<
		GenerationStructuredPreviewState["plan"],
		{ kind: "block_insert" }
	>["position"],
): void {
	if (orderedIds.includes(blockId)) {
		return;
	}

	if (position === "first") {
		orderedIds.unshift(blockId);
		return;
	}
	if (position === "last") {
		orderedIds.push(blockId);
		return;
	}

	if ("before" in position) {
		const beforeIndex = orderedIds.indexOf(position.before);
		if (beforeIndex >= 0) {
			orderedIds.splice(beforeIndex, 0, blockId);
			return;
		}
		orderedIds.unshift(blockId);
		return;
	}
	if ("after" in position) {
		const afterIndex = orderedIds.indexOf(position.after);
		if (afterIndex >= 0) {
			orderedIds.splice(afterIndex + 1, 0, blockId);
			return;
		}
	}
	orderedIds.push(blockId);
}

function parseJsonPointerPath(path: string): string[] {
	if (!path || path === "/") {
		return [];
	}
	return path
		.split("/")
		.slice(1)
		.map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function createContainerForSegment(segment: string): Record<string, unknown> | unknown[] {
	return isArrayIndexSegment(segment) ? [] : {};
}

function cloneContainer(
	value: Record<string, unknown> | unknown[],
): Record<string, unknown> | unknown[] {
	return Array.isArray(value) ? [...value] : { ...value };
}

function cloneStructuredValue(value: unknown): unknown {
	if (value == null) {
		return value;
	}
	if (typeof structuredClone === "function") {
		return structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value)) as unknown;
}

function readContainerValue(
	container: Record<string, unknown> | unknown[],
	segment: string,
): unknown {
	if (Array.isArray(container)) {
		const index = Number.parseInt(segment, 10);
		return Number.isNaN(index) ? undefined : container[index];
	}
	return container[segment];
}

function writeContainerValue(
	container: Record<string, unknown> | unknown[],
	segment: string,
	value: unknown,
): void {
	if (Array.isArray(container)) {
		const index = Number.parseInt(segment, 10);
		if (Number.isNaN(index)) {
			throw new Error(`Invalid array segment: ${segment}`);
		}
		container[index] = value;
		return;
	}
	container[segment] = value;
}

function removeContainerValue(
	container: Record<string, unknown> | unknown[],
	segment: string,
): void {
	if (Array.isArray(container)) {
		const index = Number.parseInt(segment, 10);
		if (Number.isNaN(index)) {
			throw new Error(`Invalid array segment: ${segment}`);
		}
		container.splice(index, 1);
		return;
	}
	delete container[segment];
}

function isArrayIndexSegment(segment: string): boolean {
	return /^\d+$/.test(segment);
}

function isContainerValue(
	value: unknown,
): value is Record<string, unknown> | unknown[] {
	return typeof value === "object" && value !== null;
}

function isGenerationStructuredPreviewState(
	value: unknown,
): value is GenerationStructuredPreviewState {
	if (!isRecordValue(value)) {
		return false;
	}
	return (
		(value.planState === "drafted" || value.planState === "validated") &&
		isRecordValue(value.plan) &&
		Array.isArray(value.reviewItems)
	);
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function areStructuredPreviewValuesEqual(previous: unknown, next: unknown): boolean {
	if (previous === next) {
		return true;
	}
	if (!previous || !next) {
		return previous === next;
	}

	try {
		return JSON.stringify(previous) === JSON.stringify(next);
	} catch {
		return false;
	}
}
