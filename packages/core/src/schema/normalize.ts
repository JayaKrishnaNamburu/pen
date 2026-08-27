import type {
	Block,
	BlockSchema,
	CRDTDocument,
	DiagnosticEvent,
	InlineSchema,
	LayoutSchema,
	PenDocument,
	SchemaEngine,
	SchemaRegistry,
} from "@input/pen-types";
import {
	getArrayProp,
	getCellText,
	getMapProp,
	getRowCells,
	getTableContent,
	getTextProp,
	isCRDTMap,
	type CRDTUnknownArray,
	type CRDTUnknownMap,
} from "../editor/crdtShapes";
export function sortDeltaAttributes(
	attributes: Record<string, unknown>,
	registry: SchemaRegistry,
): Record<string, unknown> {
	const keys = Object.keys(attributes);
	if (keys.length < 2) return attributes;

	const sorted = [...keys].sort((a, b) => {
		const schemaA = registry.resolveInline(a);
		const schemaB = registry.resolveInline(b);
		if (schemaA?.system || schemaB?.system) return 0;
		return (schemaA?.priority ?? 0) - (schemaB?.priority ?? 0);
	});

	const result: Record<string, unknown> = {};
	for (const key of sorted) {
		result[key] = attributes[key];
	}
	return result;
}

// ── Internal Utilities ──────────────────────────────────────

export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a === null || b === null) return false;
	if (typeof a !== typeof b) return false;
	if (typeof a !== "object") return false;

	if (Array.isArray(a)) {
		if (!Array.isArray(b) || a.length !== b.length) return false;
		return a.every((v, i) => deepEqual(v, (b as unknown[])[i]));
	}

	const keysA = Object.keys(a as Record<string, unknown>);
	const keysB = Object.keys(b as Record<string, unknown>);
	if (keysA.length !== keysB.length) return false;
	return keysA.every((k) =>
		deepEqual(
			(a as Record<string, unknown>)[k],
			(b as Record<string, unknown>)[k],
		),
	);
}

function arraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function getMapEntries(
	map: CRDTUnknownMap | null,
): Iterable<[string, unknown]> {
	return map?.entries?.() ?? [];
}

function getLayoutDefaultValue(
	layout: LayoutSchema | undefined,
	key: string,
): unknown {
	if (!layout) return undefined;

	switch (key) {
		case "modes":
			return layout.modes;
		case "defaultMode":
			return layout.defaultMode;
		case "allowedChildren":
			return layout.allowedChildren;
		case "minChildren":
			return layout.minChildren;
		case "maxChildren":
			return layout.maxChildren;
		default:
			return undefined;
	}
}

// ── SchemaEngineImpl ────────────────────────────────────────

const MAX_ITERATIONS = 1000;

type DiagnosticSink = (event: DiagnosticEvent) => void;

type NormalizePassIndex = {
	blockOrderSet: Set<string>;
	blockOrderIndices: Map<string, number[]>;
	parentByChild: Map<string, string>;
};

export class SchemaEngineImpl implements SchemaEngine {
	private readonly registry: SchemaRegistry;
	private readonly doc: PenDocument;
	private readonly crdtDoc: CRDTDocument;
	private readonly dirtyBlockIds = new Set<string>();
	private readonly deferredBlockIds = new Set<string>();
	private onDiagnostic: DiagnosticSink | undefined;
	private passIndex: NormalizePassIndex | null = null;

	constructor(
		registry: SchemaRegistry,
		doc: PenDocument,
		crdtDoc: CRDTDocument,
		onDiagnostic?: DiagnosticSink,
	) {
		this.registry = registry;
		this.doc = doc;
		this.crdtDoc = crdtDoc;
		this.onDiagnostic = onDiagnostic;
	}

	setOnDiagnostic(onDiagnostic: DiagnosticSink | undefined): void {
		this.onDiagnostic = onDiagnostic;
	}

	markDirty(blockId: string): void {
		this.dirtyBlockIds.add(blockId);
	}

	/**
	 * Drop the cached pass index because `blockOrder` or a `children` array
	 * changed outside this engine — an executing op, or a remote/undo update.
	 * Every structural mutation the engine performs itself already invalidates
	 * at the mutation site, so those callers do not go through here.
	 */
	notifyStructureChanged(): void {
		this.invalidatePassIndex();
	}

	deferBlock(blockId: string): void {
		this.deferredBlockIds.add(blockId);
	}

	undeferBlock(blockId: string): void {
		this.deferredBlockIds.delete(blockId);
		if (this.dirtyBlockIds.has(blockId)) {
			this.normalizeBlock(blockId);
			this.dirtyBlockIds.delete(blockId);
		}
	}

	normalizeDirty(): void {
		let iterations = 0;

		while (this.dirtyBlockIds.size > 0 && iterations < MAX_ITERATIONS) {
			const snapshot = [...this.dirtyBlockIds];
			if (
				snapshot.every((blockId) => this.deferredBlockIds.has(blockId))
			) {
				break;
			}

			iterations++;
			this.dirtyBlockIds.clear();

			this.doc.adapter.transact(this.crdtDoc, () => {
				for (const blockId of snapshot) {
					if (this.deferredBlockIds.has(blockId)) {
						this.dirtyBlockIds.add(blockId);
						continue;
					}
					this.normalizeBlock(blockId);
				}
			});
		}

		if (iterations >= MAX_ITERATIONS) {
			// CH5: dirty-loop cap is a diagnostic, not a console site.
			this.onDiagnostic?.({
				code: "normalize-cap",
				level: "error",
				source: "schema",
				message:
					"SchemaEngine: normalizeDirty exceeded max iterations. " +
					"Possible infinite normalization loop.",
				remediation:
					"Check block schema normalize() implementations for a cycle that keeps marking blocks dirty.",
			});
		}
	}

	normalizeAll(): void {
		this.invalidatePassIndex();
		for (const blockId of this.doc.blocks.keys()) {
			this.dirtyBlockIds.add(blockId);
		}
		this.normalizeDirty();
	}

	// ── normalizeBlock Pipeline ─────────────────────────────

	private normalizeBlock(blockId: string): void {
		const blockMap = this.getBlockMap(blockId);
		if (!blockMap) {
			this.handleDeletedBlock(blockId);
			return;
		}

		const type = blockMap.get("type") as string;
		const schema = this.registry.resolve(type);
		if (!schema) return;

		// Phase 1: Structural rules
		this.deduplicateBlockIds(blockId);
		this.enforceCrossArrayMembership(blockId);
		this.breakParentCycle(blockId);

		// Phase 2: Block-level rules
		this.stripDefaultProps(blockId, schema);
		this.runBlockNormalize(blockId, schema);

		if (this.normalizeLayout(blockId, schema)) return;

		this.ensureContentExists(blockId, schema);

		// Phase 3: Inline content rules
		if (schema.content === "inline") {
			this.stripSuperfluousMarks(blockId);
		}
	}

	// ── Rule 2: Strip Superfluous Wrappers ──────────────────

	private stripSuperfluousMarks(blockId: string): void {
		const blockMap = this.getBlockMap(blockId);
		if (!blockMap) return;

		const content = getTextProp(blockMap, "content");
		if (typeof content?.toDelta !== "function") return;

		const deltas = content.toDelta();
		if (deltas.length < 2) return;

		let offset = 0;
		for (const delta of deltas) {
			const len =
				typeof delta.insert === "string" ? delta.insert.length : 1;
			if (delta.attributes) {
				for (const [mark, value] of Object.entries(delta.attributes)) {
					const schema = this.registry.resolveInline(mark);
					if (schema?.system) continue;
					if (value === null || value === false) {
						content.format(offset, len, { [mark]: null });
					}
				}
			}
			offset += len;
		}
	}

	// ── Rule 3: No Empty Containers ─────────────────────────

	private ensureContentExists(blockId: string, schema: BlockSchema): void {
		if (schema.content !== "inline") return;

		const blockMap = this.getBlockMap(blockId);
		if (!blockMap) return;

		if (getTextProp(blockMap, "content")) return;
		blockMap.set("content", this.doc.adapter.createText());
	}

	// ── Rule 4: Strip Default Props ─────────────────────────

	private stripDefaultProps(blockId: string, schema: BlockSchema): void {
		const blockMap = this.getBlockMap(blockId);
		if (!blockMap) return;

		const props = getMapProp(blockMap, "props");
		if (!props) return;

		for (const [key, propSchema] of Object.entries(schema.propSchema)) {
			if (typeof props.has === "function") {
				if (!props.has(key)) continue;
			} else if (props.get(key) === undefined) {
				continue;
			}
			const value = props.get(key);
			const defaultValue = (propSchema as Record<string, unknown>)
				.default;
			if (defaultValue !== undefined && deepEqual(value, defaultValue)) {
				props.delete?.(key);
			}
		}
	}

	// ── Rule 5: Block-Type-Specific Normalization ───────────

	private runBlockNormalize(blockId: string, schema: BlockSchema): void {
		if (!schema.normalize) return;

		const blockMap = this.getBlockMap(blockId);
		if (!blockMap) return;

		const type = blockMap.get("type") as string;
		const props = this.readPropsWithDefaults(blockMap, schema);
		const content = getTextProp(blockMap, "content");

		const block: Block = {
			id: blockId,
			type,
			props,
			content:
				content && typeof content.toString === "function"
					? content.toString()
					: "",
		};

		const normalized = schema.normalize(block);
		if (normalized === block) return;

		const propsMap = getMapProp(blockMap, "props");
		if (propsMap && normalized.props !== block.props) {
			for (const [key, value] of Object.entries(normalized.props)) {
				if (!deepEqual(value, block.props[key])) {
					propsMap.set(key, value);
				}
			}
		}
	}

	// ── Rule 6: Layout Normalization ────────────────────────

	private normalizeLayout(blockId: string, schema: BlockSchema): boolean {
		if (!schema.layout) return false;

		const blockMap = this.getBlockMap(blockId);
		if (!blockMap) return false;

		const children = getArrayProp<string>(blockMap, "children");
		if (!children) return false;

		// Empty layout container -> collapse
		if (children.length === 0) {
			this.deleteBlock(blockId);
			this.removeFromBlockOrder(blockId);
			return true;
		}

		// Single-child row/column -> unwrap
		const layoutMap = getMapProp(blockMap, "layout");
		const layoutDir = (layoutMap?.get("direction") as string) ?? "column";
		if (
			children.length === 1 &&
			(layoutDir === "row" || layoutDir === "column")
		) {
			const childId = children.get(0);
			const idx = this.getBlockOrderIndex(blockId);
			this.removeFromBlockOrder(blockId);
			if (idx >= 0) this.insertIntoBlockOrder(childId, idx);
			this.deleteBlock(blockId);
			this.dirtyBlockIds.add(childId);
			return true;
		}

		// Strip layout props that match defaults
		const layoutProps = getMapProp(blockMap, "layout");
		if (layoutProps) {
			for (const [key, value] of [...getMapEntries(layoutProps)]) {
				const defaultValue = getLayoutDefaultValue(schema.layout, key);
				if (
					defaultValue !== undefined &&
					deepEqual(value, defaultValue)
				) {
					layoutProps.delete?.(key);
				}
			}
		}

		return false;
	}

	// ── Rule 9: No Duplicate Block IDs ──────────────────────

	private deduplicateBlockIds(blockId: string): void {
		this.deduplicateBlockOrder(blockId);

		const blockMap = this.getBlockMap(blockId);
		const children = blockMap
			? getArrayProp<string>(blockMap, "children")
			: null;
		if (children) {
			this.deduplicateArray(children, blockId);
		}
	}

	private deduplicateBlockOrder(blockId: string): void {
		const indices = this.getPassIndex().blockOrderIndices.get(blockId);
		if (!indices || indices.length <= 1) return;
		this.deduplicateAtIndices(this.blockOrder, indices);
	}

	private deduplicateArray(
		arr: CRDTUnknownArray<string>,
		targetId: string,
	): void {
		const indices: number[] = [];
		for (let i = 0; i < arr.length; i++) {
			if (arr.get(i) === targetId) {
				indices.push(i);
			}
		}
		this.deduplicateAtIndices(arr, indices);
	}

	private deduplicateAtIndices(
		arr: CRDTUnknownArray<string>,
		indices: readonly number[],
	): void {
		if (indices.length <= 1) return;

		for (let i = indices.length - 2; i >= 0; i--) {
			arr.delete(indices[i], 1);
		}
		this.invalidatePassIndex();
	}

	// ── Rule 10: Orphan Promotion ───────────────────────────

	private handleDeletedBlock(blockId: string): void {
		for (const [id, rawBlockMap] of this.doc.blocks.entries()) {
			if (!isCRDTMap(rawBlockMap)) continue;
			const props = getMapProp(rawBlockMap, "props");
			if (!props) continue;
			const parentId = props.get("parentId");
			if (parentId === blockId) {
				props.delete?.("parentId");
				this.dirtyBlockIds.add(id);
			}
		}
	}

	// ── COL4: Parent-cycle break ─────────────────────────────
	// When a parent chain reaches itself, clear the edge whose owning
	// block id sorts lowest so every peer computes the same repair.

	private breakParentCycle(blockId: string): void {
		const cycle = this.walkParentCycle(blockId);
		if (!cycle) return;

		let ownerToClear: string | undefined;
		let childToClear: string | undefined;
		for (const childId of cycle) {
			const parentId = this.parentOf(childId);
			if (!parentId) continue;
			const ownerId = this.parentEdgeOwner(childId, parentId);
			if (ownerToClear === undefined || ownerId < ownerToClear) {
				ownerToClear = ownerId;
				childToClear = childId;
			}
		}

		if (childToClear === undefined) return;
		const parentId = this.parentOf(childToClear);
		if (!parentId) return;
		this.clearParentEdge(childToClear, parentId);
		this.invalidatePassIndex();
		this.dirtyBlockIds.add(childToClear);
		this.dirtyBlockIds.add(parentId);
		this.onDiagnostic?.({
			code: "parent-cycle",
			level: "warn",
			source: "schema",
			message: `Parent cycle broken by clearing the edge owned by "${ownerToClear}".`,
			remediation:
				"Concurrent structural edits produced a parent cycle. The lexicographically lowest owning block id loses that parent edge so every peer repairs the same way.",
		});
	}

	private walkParentCycle(startId: string): string[] | null {
		const seen: string[] = [];
		const seenSet = new Set<string>();
		let current: string | null = startId;

		while (current) {
			if (seenSet.has(current)) {
				return seen.slice(seen.indexOf(current));
			}
			if (!this.getBlockMap(current)) {
				return null;
			}
			seen.push(current);
			seenSet.add(current);
			current = this.parentOf(current);
		}

		return null;
	}

	private parentOf(blockId: string): string | null {
		const fromProp = this.readParentIdProp(blockId);
		if (fromProp) return fromProp;
		return this.findParentWithChild(blockId);
	}

	private readParentIdProp(blockId: string): string | null {
		const blockMap = this.getBlockMap(blockId);
		if (!blockMap) return null;
		const props = getMapProp(blockMap, "props");
		const parentId = props?.get("parentId");
		return typeof parentId === "string" && parentId.length > 0
			? parentId
			: null;
	}

	private parentEdgeOwner(childId: string, parentId: string): string {
		return this.readParentIdProp(childId) === parentId ? childId : parentId;
	}

	private clearParentEdge(childId: string, parentId: string): void {
		if (this.readParentIdProp(childId) === parentId) {
			const blockMap = this.getBlockMap(childId);
			const props = blockMap ? getMapProp(blockMap, "props") : null;
			props?.delete?.("parentId");
			return;
		}

		const parentMap = this.getBlockMap(parentId);
		const children = parentMap
			? getArrayProp<string>(parentMap, "children")
			: null;
		if (!children) return;
		for (let i = children.length - 1; i >= 0; i--) {
			if (children.get(i) === childId) {
				children.delete(i, 1);
			}
		}
	}

	// ── Rule 11: No Cross-Array Membership ──────────────────

	private enforceCrossArrayMembership(blockId: string): void {
		const inBlockOrder = this.isInBlockOrder(blockId);
		const parentEntry = this.findParentWithChild(blockId);

		if (inBlockOrder && parentEntry) {
			this.removeFromBlockOrder(blockId);
		}
	}

	private isInBlockOrder(blockId: string): boolean {
		return this.getPassIndex().blockOrderSet.has(blockId);
	}

	private findParentWithChild(blockId: string): string | null {
		return this.getPassIndex().parentByChild.get(blockId) ?? null;
	}

	// ── Block Order Helpers ─────────────────────────────────

	private removeFromBlockOrder(blockId: string): void {
		const indices = this.getPassIndex().blockOrderIndices.get(blockId);
		if (indices && indices.length > 0) {
			this.blockOrder.delete(indices[indices.length - 1], 1);
			this.invalidatePassIndex();
			return;
		}
		for (let i = this.blockOrder.length - 1; i >= 0; i--) {
			if (this.blockOrder.get(i) === blockId) {
				this.blockOrder.delete(i, 1);
				this.invalidatePassIndex();
				return;
			}
		}
	}

	private insertIntoBlockOrder(blockId: string, index: number): void {
		this.blockOrder.insert(index, [blockId]);
		this.invalidatePassIndex();
	}

	private getBlockOrderIndex(blockId: string): number {
		const indices = this.getPassIndex().blockOrderIndices.get(blockId);
		if (indices && indices.length > 0) {
			return indices[0];
		}
		return -1;
	}

	// ── Read Helpers ────────────────────────────────────────

	private readPropsWithDefaults(
		blockMap: CRDTUnknownMap,
		schema: BlockSchema,
	): Record<string, unknown> {
		const props: Record<string, unknown> = {};

		if (schema.propSchema) {
			for (const [key, propDef] of Object.entries(schema.propSchema)) {
				props[key] = (propDef as Record<string, unknown>).default;
			}
		}

		for (const [key, value] of getMapEntries(
			getMapProp(blockMap, "props"),
		)) {
			props[key] = value;
		}

		return props;
	}

	private get blockOrder(): CRDTUnknownArray<string> {
		return this.doc.blockOrder as unknown as CRDTUnknownArray<string>;
	}

	private get blocksMap(): CRDTUnknownMap {
		return this.doc.blocks as unknown as CRDTUnknownMap;
	}

	private getBlockMap(blockId: string): CRDTUnknownMap | null {
		const blockMap = this.doc.blocks.get(blockId);
		return isCRDTMap(blockMap) ? blockMap : null;
	}

	private deleteBlock(blockId: string): void {
		this.blocksMap.delete?.(blockId);
		this.invalidatePassIndex();
	}

	private getPassIndex(): NormalizePassIndex {
		if (!this.passIndex) {
			this.passIndex = this.buildPassIndex();
		}
		return this.passIndex;
	}

	private invalidatePassIndex(): void {
		this.passIndex = null;
	}

	private buildPassIndex(): NormalizePassIndex {
		const blockOrderSet = new Set<string>();
		const blockOrderIndices = new Map<string, number[]>();
		const parentByChild = new Map<string, string>();

		for (let i = 0; i < this.blockOrder.length; i++) {
			const id = this.blockOrder.get(i);
			blockOrderSet.add(id);
			const indices = blockOrderIndices.get(id);
			if (indices) {
				indices.push(i);
			} else {
				blockOrderIndices.set(id, [i]);
			}
		}

		for (const [id, rawBlockMap] of this.doc.blocks.entries()) {
			if (!isCRDTMap(rawBlockMap)) continue;
			const children = getArrayProp<string>(rawBlockMap, "children");
			if (!children) continue;
			for (let i = 0; i < children.length; i++) {
				const childId = children.get(i);
				if (!parentByChild.has(childId)) {
					parentByChild.set(childId, id);
				}
			}
		}

		return { blockOrderSet, blockOrderIndices, parentByChild };
	}
}
