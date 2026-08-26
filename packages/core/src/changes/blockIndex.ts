import type { ChangeSummary, StructuralChange, TextSplice } from "./types";

export interface BlockIndexSnapshot {
	readonly lengthById: ReadonlyMap<string, number>;
	readonly typeById: ReadonlyMap<string, string>;
	readonly parentById: ReadonlyMap<string, string | null>;
	readonly childrenByParentId: ReadonlyMap<string | null, readonly string[]>;
	readonly order: readonly string[];
	readonly roots: readonly string[];
}

export interface BlockIndex {
	snapshot(): BlockIndexSnapshot;
	apply(summary: ChangeSummary): void;
	replace(snapshot: BlockIndexSnapshot): void;
}

export function emptyBlockIndexSnapshot(): BlockIndexSnapshot {
	return {
		lengthById: new Map(),
		typeById: new Map(),
		parentById: new Map(),
		childrenByParentId: new Map([[null, []]]),
		order: [],
		roots: [],
	};
}

export function createBlockIndexSnapshot(input: {
	readonly roots: readonly string[];
	readonly lengthById?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
	readonly typeById?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
	readonly childrenByParentId?: ReadonlyMap<string | null, readonly string[]>;
}): BlockIndexSnapshot {
	const lengthById = toNumberMap(input.lengthById);
	const typeById = toStringMap(input.typeById);
	const childrenByParentId = new Map<string | null, readonly string[]>(
		input.childrenByParentId ?? [[null, input.roots]],
	);
	if (!childrenByParentId.has(null)) {
		childrenByParentId.set(null, input.roots);
	}
	const parentById = new Map<string, string | null>();
	for (const [parentId, children] of childrenByParentId) {
		for (const childId of children) {
			parentById.set(childId, parentId);
		}
	}
	const roots = [...(childrenByParentId.get(null) ?? input.roots)];
	return {
		lengthById,
		typeById,
		parentById,
		childrenByParentId,
		order: flattenOrder(roots, childrenByParentId),
		roots,
	};
}

export function createEmptyBlockIndex(): BlockIndex {
	return createBlockIndex(emptyBlockIndexSnapshot());
}

export function createBlockIndex(initial: BlockIndexSnapshot): BlockIndex {
	let current = cloneSnapshot(initial);
	return {
		snapshot() {
			return current;
		},
		apply(summary) {
			current = applySummaryToSnapshot(current, summary);
		},
		replace(snapshot) {
			current = cloneSnapshot(snapshot);
		},
	};
}

function applySummaryToSnapshot(
	snapshot: BlockIndexSnapshot,
	summary: ChangeSummary,
): BlockIndexSnapshot {
	const lengthById = new Map(snapshot.lengthById);
	const typeById = new Map(snapshot.typeById);
	const childrenByParentId = cloneChildren(snapshot.childrenByParentId);

	for (const change of summary.structural) {
		applyStructural(change, lengthById, typeById, childrenByParentId);
	}

	for (const text of summary.blockText) {
		const previous = lengthById.get(text.blockId) ?? 0;
		lengthById.set(text.blockId, lengthAfterSplices(previous, text.splices));
	}

	const roots = [...(childrenByParentId.get(null) ?? [])];
	const parentById = new Map<string, string | null>();
	for (const [parentId, children] of childrenByParentId) {
		for (const childId of children) {
			parentById.set(childId, parentId);
		}
	}

	return {
		lengthById,
		typeById,
		parentById,
		childrenByParentId,
		order: flattenOrder(roots, childrenByParentId),
		roots,
	};
}

function lengthAfterSplices(
	length: number,
	splices: readonly TextSplice[],
): number {
	let next = length;
	for (const splice of splices) {
		next += splice.insertLength - (splice.to - splice.from);
	}
	return Math.max(0, next);
}

function cloneSnapshot(snapshot: BlockIndexSnapshot): BlockIndexSnapshot {
	return {
		lengthById: new Map(snapshot.lengthById),
		typeById: new Map(snapshot.typeById),
		parentById: new Map(snapshot.parentById),
		childrenByParentId: cloneChildren(snapshot.childrenByParentId),
		order: [...snapshot.order],
		roots: [...snapshot.roots],
	};
}

function applyStructural(
	change: StructuralChange,
	lengthById: Map<string, number>,
	typeById: Map<string, string>,
	childrenByParentId: Map<string | null, string[]>,
): void {
	switch (change.type) {
		case "block-inserted": {
			insertChild(childrenByParentId, change.parentId, change.index, change.blockId);
			if (!lengthById.has(change.blockId)) lengthById.set(change.blockId, 0);
			break;
		}
		case "block-removed": {
			removeChild(childrenByParentId, change.parentId, change.blockId);
			lengthById.delete(change.blockId);
			typeById.delete(change.blockId);
			childrenByParentId.delete(change.blockId);
			break;
		}
		case "block-moved": {
			removeChild(childrenByParentId, change.fromParentId, change.blockId);
			insertChild(childrenByParentId, change.toParentId, change.toIndex, change.blockId);
			break;
		}
		case "block-split": {
			insertAfter(childrenByParentId, change.blockId, change.newBlockId);
			const original = lengthById.get(change.blockId) ?? 0;
			lengthById.set(change.blockId, Math.max(0, change.offset));
			lengthById.set(change.newBlockId, Math.max(0, original - change.offset));
			if (!typeById.has(change.newBlockId)) {
				typeById.set(change.newBlockId, typeById.get(change.blockId) ?? "");
			}
			break;
		}
		case "blocks-merged": {
			const parentId = parentOf(childrenByParentId, change.sourceBlockId);
			const targetLength = lengthById.get(change.targetBlockId) ?? 0;
			const sourceLength = lengthById.get(change.sourceBlockId) ?? 0;
			lengthById.set(change.targetBlockId, targetLength + sourceLength);
			removeChild(childrenByParentId, parentId, change.sourceBlockId);
			lengthById.delete(change.sourceBlockId);
			typeById.delete(change.sourceBlockId);
			childrenByParentId.delete(change.sourceBlockId);
			break;
		}
		case "block-props-changed":
		case "table-changed":
		case "apps-changed":
		case "metadata-changed":
			break;
		default: {
			const _exhaustive: never = change;
			return _exhaustive;
		}
	}
}

function insertAfter(
	childrenByParentId: Map<string | null, string[]>,
	beforeId: string,
	newId: string,
): void {
	for (const [parentId, children] of childrenByParentId) {
		const index = children.indexOf(beforeId);
		if (index < 0) continue;
		if (!children.includes(newId)) {
			children.splice(index + 1, 0, newId);
		}
		childrenByParentId.set(parentId, children);
		return;
	}
	insertChild(childrenByParentId, null, -1, newId);
}

function insertChild(
	childrenByParentId: Map<string | null, string[]>,
	parentId: string | null,
	index: number,
	blockId: string,
): void {
	const children = childrenByParentId.get(parentId) ?? [];
	const next = children.filter((id) => id !== blockId);
	const at = index < 0 || index > next.length ? next.length : index;
	next.splice(at, 0, blockId);
	childrenByParentId.set(parentId, next);
}

function removeChild(
	childrenByParentId: Map<string | null, string[]>,
	parentId: string | null,
	blockId: string,
): void {
	const children = childrenByParentId.get(parentId);
	if (!children) {
		for (const [id, list] of childrenByParentId) {
			const index = list.indexOf(blockId);
			if (index >= 0) {
				list.splice(index, 1);
				childrenByParentId.set(id, list);
				return;
			}
		}
		return;
	}
	const index = children.indexOf(blockId);
	if (index >= 0) children.splice(index, 1);
	childrenByParentId.set(parentId, children);
}

function parentOf(
	childrenByParentId: Map<string | null, string[]>,
	blockId: string,
): string | null {
	for (const [parentId, children] of childrenByParentId) {
		if (children.includes(blockId)) return parentId;
	}
	return null;
}

function flattenOrder(
	roots: readonly string[],
	childrenByParentId: ReadonlyMap<string | null, readonly string[]>,
): string[] {
	const order: string[] = [];
	const visit = (id: string) => {
		order.push(id);
		for (const child of childrenByParentId.get(id) ?? []) {
			visit(child);
		}
	};
	for (const root of roots) visit(root);
	return order;
}

function cloneChildren(
	childrenByParentId: ReadonlyMap<string | null, readonly string[]>,
): Map<string | null, string[]> {
	const next = new Map<string | null, string[]>();
	for (const [parentId, children] of childrenByParentId) {
		next.set(parentId, [...children]);
	}
	return next;
}

function toNumberMap(
	value: ReadonlyMap<string, number> | Readonly<Record<string, number>> | undefined,
): Map<string, number> {
	if (!value) return new Map();
	if (value instanceof Map) return new Map(value);
	return new Map(Object.entries(value));
}

function toStringMap(
	value: ReadonlyMap<string, string> | Readonly<Record<string, string>> | undefined,
): Map<string, string> {
	if (!value) return new Map();
	if (value instanceof Map) return new Map(value);
	return new Map(Object.entries(value));
}
