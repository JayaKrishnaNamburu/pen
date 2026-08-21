import type {
	BlockHandle,
	BlockSelection,
	CellSelection,
	ChangeSummary,
	CRDTDocument,
	CRDTMap,
	DiagnosticEvent,
	PenDocument,
	Point,
	SchemaRegistry,
	SelectionOrigin,
	SelectionRecord,
	SelectionRecordState,
	SelectionState,
	TextSelection,
} from "@input/pen-types";
import { logicalTextFromStored } from "@input/pen-types";
import { getSummaryState } from "../changes/mapping";
import type { ChangeSummary as CoreChangeSummary } from "../changes/types";
import { usesInlineTextSelection } from "../schema/fieldEditorCapabilities";
import { createBlockHandle } from "../schema/handles";
import {
	getSelectionBlockRange,
	selectionToRange,
	stampTextSelection,
} from "../selection/helpers";
import { resolveCellSelectionMatrix } from "./cellSelection";
import { EventEmitter } from "./events";

type CRDTBlockMap = CRDTMap<CRDTMap<unknown>>;

const INVALID_BLOCK_CODE = "selection-invalid-block";
const RESERVED_ORIGIN_CODE = "selection-reserved-origin";

/**
 * Mixed-boundary N2 hole: a text endpoint on a non-text block is still
 * admitted (clamped to 0..1) when the other endpoint sits on a different
 * block. `selectTextRange(p1@2, d1@1)` + `deleteSelection` keeps the
 * paragraph suffix and deletes the divider (`deleteMultiBlockTextRange`).
 * Retargeting that write onto `selectBlock` would delete the entire
 * paragraph — an owner decision, not this clamp.
 *
 * Same-block fully-selected (0..1) divider/table writes are converted
 * to `BlockSelection` in `_validateText`. A collapsed caret on a table
 * stays a text point — autocomplete and similar callers still probe it.
 * `nextNormalPosition` already forbids these positions (N2).
 */
export function clampNonTextPseudoOffset(offset: number): number {
	if (!Number.isFinite(offset)) {
		return 0;
	}
	return Math.max(0, Math.min(offset, 1));
}

export interface SelectionAuthority {
	readonly record: SelectionRecord;
	set(
		state: SelectionState,
		options: { origin: SelectionOrigin },
	): SelectionRecord;
	onCommit(summary: ChangeSummary | CoreChangeSummary): void;
}

export class SelectionAuthorityImpl implements SelectionAuthority {
	private _state: SelectionState = null;
	private _version = 0;
	private _origin: SelectionOrigin = "programmatic";
	private _commitId = 0;
	private _doc: PenDocument;
	private _crdtDoc: CRDTDocument;
	private readonly _registry: SchemaRegistry;
	private readonly _emitter: EventEmitter;

	constructor(
		doc: PenDocument,
		crdtDoc: CRDTDocument,
		registry: SchemaRegistry,
		emitter: EventEmitter,
	) {
		this._doc = doc;
		this._crdtDoc = crdtDoc;
		this._registry = registry;
		this._emitter = emitter;
	}

	get record(): SelectionRecord {
		return {
			state: toRecordState(this._state),
			version: this._version,
			origin: this._origin,
			commitId: this._commitId,
		};
	}

	getSelection(): SelectionState {
		return this._state;
	}

	set(
		state: SelectionState,
		options: { origin: SelectionOrigin },
	): SelectionRecord {
		if (options.origin === "gc") {
			this._emitDiagnostic({
				code: RESERVED_ORIGIN_CODE,
				level: "warn",
				source: "core",
				message: 'origin "gc" is reserved for SelectionAuthority repair writes',
				remediation:
					'Pass a caller origin such as "programmatic", "keyboard", or "pointer".',
			});
			return this.record;
		}
		return this._accept(state, options.origin, this._commitId);
	}

	onCommit(summary: ChangeSummary | CoreChangeSummary): void {
		const mapped = this._mapState(this._state, summary);
		if (mapped === undefined) {
			return;
		}
		this._accept(mapped, "mapped", summary.commitId, { emit: false });
	}

	updateDocument(doc: PenDocument, crdtDoc: CRDTDocument): void {
		this._doc = doc;
		this._crdtDoc = crdtDoc;
		this._state = null;
		this._version += 1;
		this._origin = "programmatic";
		this._emitter.emit("selectionChange", this.record);
	}

	getSelectedText(): string {
		const sel = this._state;
		if (!sel) {
			return "";
		}

		if (sel.type === "text") {
			const range = selectionToRange(this._doc, sel);
			const blockIds = getSelectionBlockRange(this._doc, sel);
			if (blockIds.length <= 1) {
				const full = this._logicalText(sel.anchor.blockId);
				const from = Math.min(sel.anchor.offset, sel.focus.offset);
				const to = Math.max(sel.anchor.offset, sel.focus.offset);
				return full.slice(from, to);
			}

			const parts = blockIds.map((blockId, index) => {
				const full = this._logicalText(blockId);
				if (blockIds.length === 1) {
					return full.slice(range.start.offset, range.end.offset);
				}
				if (index === 0) {
					return full.slice(range.start.offset);
				}
				if (index === blockIds.length - 1) {
					return full.slice(0, range.end.offset);
				}
				return full;
			});
			return parts.join("\n");
		}

		if (sel.type === "block") {
			const parts: string[] = [];
			for (const id of sel.blockIds) {
				if (!this._blockExists(id)) {
					continue;
				}
				parts.push(this._handle(id).textContent());
			}
			return parts.join("\n");
		}

		if (sel.type === "cell") {
			return this._getSelectedCellText(sel);
		}

		return "";
	}

	getSelectedBlocks(): BlockHandle[] {
		const sel = this._state;
		if (!sel) {
			return [];
		}

		if (sel.type === "block") {
			return sel.blockIds
				.filter((id) => this._blockExists(id))
				.map((id) => this._handle(id));
		}

		if (sel.type === "text") {
			return getSelectionBlockRange(this._doc, sel)
				.filter((id) => this._blockExists(id))
				.map((id) => this._handle(id));
		}

		return [];
	}

	private _accept(
		state: SelectionState,
		origin: SelectionOrigin,
		commitId: number,
		options?: { emit?: boolean },
	): SelectionRecord {
		const validated = this._validate(state);
		if (validated === undefined) {
			return this.record;
		}
		if (selectionEquals(this._state, validated)) {
			return this.record;
		}
		this._state = validated;
		this._version += 1;
		this._origin = origin;
		this._commitId = commitId;
		if (options?.emit !== false) {
			this._emitter.emit("selectionChange", this.record);
		}
		return this.record;
	}

	private _validate(sel: SelectionState): SelectionState | undefined {
		if (sel === null) {
			return null;
		}
		switch (sel.type) {
			case "text":
				return this._validateText(sel);
			case "block":
				return this._validateBlock(sel);
			case "app":
				return { type: "app", appId: sel.appId };
			case "cell":
				return this._validateCell(sel);
			default: {
				const _exhaustive: never = sel;
				return _exhaustive;
			}
		}
	}

	private _validateText(sel: TextSelection): SelectionState | undefined {
		if (
			!this._blockExists(sel.anchor.blockId) ||
			!this._blockExists(sel.focus.blockId)
		) {
			this._emitMissingBlock(
				this._blockExists(sel.anchor.blockId)
					? sel.focus.blockId
					: sel.anchor.blockId,
			);
			return undefined;
		}
		if (
			sel.anchor.blockId === sel.focus.blockId &&
			this._isNonTextBlock(sel.anchor.blockId) &&
			this._isFullySelectedNonText(sel)
		) {
			return this._validateBlock({
				type: "block",
				blockIds: [sel.anchor.blockId],
				head: sel.anchor.blockId,
			});
		}
		return stampTextSelection(this._doc, {
			anchor: {
				blockId: sel.anchor.blockId,
				offset: this._clampOffset(sel.anchor.blockId, sel.anchor.offset),
			},
			focus: {
				blockId: sel.focus.blockId,
				offset: this._clampOffset(sel.focus.blockId, sel.focus.offset),
			},
			affinity: sel.affinity,
			goalX: sel.goalX,
		});
	}

	private _validateBlock(sel: BlockSelection): BlockSelection | undefined {
		if (sel.blockIds.length === 0) {
			this._emitMissingBlock("");
			return undefined;
		}
		for (const id of sel.blockIds) {
			if (!this._blockExists(id)) {
				this._emitMissingBlock(id);
				return undefined;
			}
		}
		return {
			type: "block",
			blockIds: [...sel.blockIds],
			head:
				sel.head && sel.blockIds.includes(sel.head)
					? sel.head
					: (sel.blockIds[sel.blockIds.length - 1] ??
						sel.blockIds[0] ??
						""),
		};
	}

	private _validateCell(sel: CellSelection): CellSelection | undefined {
		if (!this._blockExists(sel.blockId)) {
			this._emitMissingBlock(sel.blockId);
			return undefined;
		}
		const grid = this._tableGrid(sel.blockId);
		if (!grid) {
			return {
				type: "cell",
				blockId: sel.blockId,
				anchor: { ...sel.anchor },
				head: { ...sel.head },
				...(sel.rowIds ? { rowIds: [...sel.rowIds] } : {}),
				...(sel.columnIds ? { columnIds: [...sel.columnIds] } : {}),
			};
		}
		return {
			type: "cell",
			blockId: sel.blockId,
			anchor: clampCellCoord(sel.anchor, grid),
			head: clampCellCoord(sel.head, grid),
			...(sel.rowIds ? { rowIds: [...sel.rowIds] } : {}),
			...(sel.columnIds ? { columnIds: [...sel.columnIds] } : {}),
		};
	}

	private _mapState(
		state: SelectionState,
		summary: ChangeSummary | CoreChangeSummary,
	): SelectionState | undefined {
		if (state === null) {
			return undefined;
		}
		switch (state.type) {
			case "text":
				return this._mapText(state, summary);
			case "block":
				return this._mapBlock(state, summary);
			case "cell":
				return this._mapCell(state, summary);
			case "app":
				return undefined;
			default: {
				const _exhaustive: never = state;
				return _exhaustive;
			}
		}
	}

	private _mapText(
		state: TextSelection,
		summary: ChangeSummary | CoreChangeSummary,
	): SelectionState | undefined {
		const collapsed = isCollapsedRange(state);
		const mapped = summary.mapRange(
			{ anchor: state.anchor, focus: state.focus },
			{
				mode: "clamp",
				anchorAssoc: collapsed ? 1 : -1,
				focusAssoc: 1,
			},
		);
		if (!mapped) {
			return null;
		}
		const next = stampTextSelection(this._doc, {
			anchor: this._liveMappedPoint(state.anchor, mapped.anchor, summary),
			focus: this._liveMappedPoint(state.focus, mapped.focus, summary),
			affinity: state.affinity,
			goalX: state.goalX,
		});
		if (selectionEquals(state, next)) {
			return undefined;
		}
		return next;
	}

	private _mapBlock(
		state: BlockSelection,
		summary: ChangeSummary | CoreChangeSummary,
	): SelectionState | undefined {
		const removed = removedBlockIds(summary);
		const remaining = state.blockIds.filter((id) => !removed.has(id));
		if (remaining.length > 0) {
			const next: BlockSelection = {
				type: "block",
				blockIds: remaining,
				head:
					state.head && remaining.includes(state.head)
						? state.head
						: (remaining[remaining.length - 1] ?? remaining[0] ?? ""),
			};
			if (selectionEquals(state, next)) {
				return undefined;
			}
			return next;
		}

		const firstDeleted = state.blockIds[0];
		if (!firstDeleted) {
			return null;
		}
		const mapped = summary.mapPoint(
			{ blockId: firstDeleted, offset: 0 },
			1,
			"clamp",
		);
		if (!mapped) {
			return null;
		}
		const point = this._liveMappedPoint(
			{ blockId: firstDeleted, offset: 0 },
			mapped,
			summary,
		);
		return stampTextSelection(this._doc, {
			anchor: point,
			focus: point,
		});
	}

	private _mapCell(
		state: CellSelection,
		summary: ChangeSummary | CoreChangeSummary,
	): SelectionState | undefined {
		const tableChanged = summary.structural.some(
			(change) =>
				change.type === "table-changed" &&
				change.blockId === state.blockId,
		);
		if (tableChanged) {
			const grid = this._tableGrid(state.blockId);
			if (!grid) {
				return {
					type: "cell",
					blockId: state.blockId,
					anchor: { row: 0, col: 0 },
					head: { row: 0, col: 0 },
				};
			}
			return {
				type: "cell",
				blockId: state.blockId,
				anchor: { row: 0, col: 0 },
				head: { row: 0, col: 0 },
			};
		}

		if (removedBlockIds(summary).has(state.blockId)) {
			const mapped = summary.mapPoint(
				{ blockId: state.blockId, offset: 0 },
				1,
				"clamp",
			);
			if (!mapped) {
				return null;
			}
			return stampTextSelection(this._doc, {
				anchor: mapped,
				focus: mapped,
			});
		}

		const grid = this._tableGrid(state.blockId);
		if (!grid) {
			return undefined;
		}
		const next: CellSelection = {
			type: "cell",
			blockId: state.blockId,
			anchor: clampCellCoord(state.anchor, grid),
			head: clampCellCoord(state.head, grid),
			...(state.rowIds ? { rowIds: [...state.rowIds] } : {}),
			...(state.columnIds ? { columnIds: [...state.columnIds] } : {}),
		};
		if (selectionEquals(state, next)) {
			return undefined;
		}
		return next;
	}

	/**
	 * Mapping clamps against the pre-commit index. When that index is
	 * missing or 0 for a block that still exists and had no splices, the
	 * clamp is a stale-index artifact — keep the original offset against
	 * the live logical length (A1 + I5).
	 */
	private _liveMappedPoint(
		original: Point,
		mapped: Point,
		summary: ChangeSummary | CoreChangeSummary,
	): Point {
		if (!this._blockExists(mapped.blockId)) {
			return mapped;
		}
		const liveLength = this._logicalLength(mapped.blockId);
		if (mapped.blockId !== original.blockId) {
			return {
				blockId: mapped.blockId,
				offset: clampOffsetToLength(mapped.offset, liveLength),
			};
		}
		const indexLength = getSummaryState(summary).index.lengthById.get(
			original.blockId,
		);
		const textChange = summary.text.find(
			(change) => change.blockId === original.blockId,
		);
		const hasSplices = (textChange?.splices.length ?? 0) > 0;
		if (
			!removedBlockIds(summary).has(original.blockId) &&
			!hasSplices &&
			(indexLength === undefined || indexLength === 0)
		) {
			return {
				blockId: original.blockId,
				offset: clampOffsetToLength(original.offset, liveLength),
			};
		}
		return {
			blockId: mapped.blockId,
			offset: clampOffsetToLength(mapped.offset, liveLength),
		};
	}

	private _isNonTextBlock(blockId: string): boolean {
		const blockMap = (this._doc.blocks as CRDTBlockMap).get(blockId);
		const blockType = blockMap?.get("type");
		if (typeof blockType !== "string") {
			return false;
		}
		const schema = this._registry.resolve(blockType);
		return Boolean(schema && !usesInlineTextSelection(schema));
	}

	/** v1 non-text span is 0..1; only that full cover is safe to escalate. */
	private _isFullySelectedNonText(sel: TextSelection): boolean {
		const from = Math.min(sel.anchor.offset, sel.focus.offset);
		const to = Math.max(sel.anchor.offset, sel.focus.offset);
		return from <= 0 && to >= 1;
	}

	private _clampOffset(blockId: string, offset: number): number {
		if (!Number.isFinite(offset) || offset < 0) {
			return 0;
		}
		if (this._isNonTextBlock(blockId)) {
			return clampNonTextPseudoOffset(offset);
		}
		return clampOffsetToLength(offset, this._logicalLength(blockId));
	}

	private _logicalText(blockId: string): string {
		if (!this._blockExists(blockId)) {
			return "";
		}
		const stored = this._handle(blockId)
			.textDeltas()
			.map((delta) => delta.insert)
			.join("");
		return logicalTextFromStored(stored);
	}

	/** N1: each inline embed occupies one logical offset. */
	private _logicalLength(blockId: string): number {
		if (!this._blockExists(blockId)) {
			return 0;
		}
		let stored = "";
		let embeds = 0;
		for (const delta of this._handle(blockId).inlineDeltas()) {
			if (typeof delta.insert === "string") {
				stored += delta.insert;
			} else {
				embeds += 1;
			}
		}
		return logicalTextFromStored(stored).length + embeds;
	}

	private _tableGrid(
		blockId: string,
	): { rows: number; cols: number } | null {
		const table = this._handle(blockId).as("table");
		const rows = table?.tableRowCount() ?? 0;
		const cols = table?.tableColumnCount() ?? 0;
		if (rows <= 0 || cols <= 0) {
			return null;
		}
		return { rows, cols };
	}

	private _blockExists(blockId: string): boolean {
		return (this._doc.blocks as CRDTBlockMap).has(blockId);
	}

	private _handle(blockId: string): BlockHandle {
		return createBlockHandle(
			blockId,
			this._doc,
			this._crdtDoc,
			this._registry,
		);
	}

	private _emitMissingBlock(blockId: string): void {
		this._emitDiagnostic({
			code: INVALID_BLOCK_CODE,
			level: "warn",
			source: "core",
			message: blockId
				? `selection references missing block "${blockId}"`
				: "selection references no blocks",
			remediation: "Pass block ids that exist in the current document.",
			blockId,
		});
	}

	private _emitDiagnostic(event: DiagnosticEvent): void {
		this._emitter.emit("diagnostic", event);
	}

	private _getSelectedCellText(sel: CellSelection): string {
		const block = this._handle(sel.blockId);
		const matrix = resolveCellSelectionMatrix(block, sel);
		const table = block.as("table");
		const rowParts: string[] = [];
		for (const rowCells of matrix) {
			const cellParts: string[] = [];
			for (const cellCoord of rowCells) {
				const cell = table?.tableCell(cellCoord.row, cellCoord.col);
				cellParts.push(cell?.textContent() ?? "");
			}
			rowParts.push(cellParts.join("\t"));
		}
		return rowParts.join("\n");
	}
}

export function selectionEquals(
	left: SelectionState,
	right: SelectionState,
): boolean {
	if (left === right) {
		return true;
	}
	if (left === null || right === null) {
		return false;
	}
	if (left.type !== right.type) {
		return false;
	}
	switch (left.type) {
		case "text": {
			if (right.type !== "text") {
				return false;
			}
			return (
				pointEquals(left.anchor, right.anchor) &&
				pointEquals(left.focus, right.focus) &&
				(left.affinity ?? "downstream") ===
					(right.affinity ?? "downstream")
			);
		}
		case "block": {
			if (right.type !== "block") {
				return false;
			}
			if (left.blockIds.length !== right.blockIds.length) {
				return false;
			}
			if (left.blockIds.some((id, index) => id !== right.blockIds[index])) {
				return false;
			}
			const leftHead =
				left.head ??
				left.blockIds[left.blockIds.length - 1] ??
				left.blockIds[0] ??
				"";
			const rightHead =
				right.head ??
				right.blockIds[right.blockIds.length - 1] ??
				right.blockIds[0] ??
				"";
			return leftHead === rightHead;
		}
		case "app":
			return right.type === "app" && left.appId === right.appId;
		case "cell": {
			if (right.type !== "cell") {
				return false;
			}
			return (
				left.blockId === right.blockId &&
				left.anchor.row === right.anchor.row &&
				left.anchor.col === right.anchor.col &&
				left.head.row === right.head.row &&
				left.head.col === right.head.col
			);
		}
		default: {
			const _exhaustive: never = left;
			return _exhaustive;
		}
	}
}

export function toRecordState(state: SelectionState): SelectionRecordState {
	if (state === null) {
		return null;
	}
	switch (state.type) {
		case "text":
			return {
				type: "text",
				anchor: { ...state.anchor },
				focus: { ...state.focus },
				affinity: state.affinity ?? "downstream",
				goalX: state.goalX ?? null,
			};
		case "block":
			return {
				type: "block",
				blockIds: [...state.blockIds],
				head:
					state.head ??
					state.blockIds[state.blockIds.length - 1] ??
					state.blockIds[0] ??
					"",
			};
		case "app":
			return { type: "app", appId: state.appId };
		case "cell":
			return {
				type: "cell",
				blockId: state.blockId,
				anchor: { ...state.anchor },
				head: { ...state.head },
			};
		default: {
			const _exhaustive: never = state;
			return _exhaustive;
		}
	}
}

function pointEquals(left: Point, right: Point): boolean {
	return left.blockId === right.blockId && left.offset === right.offset;
}

function isCollapsedRange(range: { anchor: Point; focus: Point }): boolean {
	return (
		range.anchor.blockId === range.focus.blockId &&
		range.anchor.offset === range.focus.offset
	);
}

function clampCellCoord(
	coord: { row: number; col: number },
	grid: { rows: number; cols: number },
): { row: number; col: number } {
	return {
		row: clampIndex(coord.row, grid.rows),
		col: clampIndex(coord.col, grid.cols),
	};
}

function clampOffsetToLength(offset: number, length: number): number {
	if (!Number.isFinite(offset) || offset < 0) {
		return 0;
	}
	return Math.max(0, Math.min(offset, length));
}

function clampIndex(value: number, length: number): number {
	if (!Number.isFinite(value) || length <= 0) {
		return 0;
	}
	return Math.max(0, Math.min(Math.trunc(value), length - 1));
}

function removedBlockIds(
	summary: ChangeSummary | CoreChangeSummary,
): Set<string> {
	const removed = new Set<string>();
	for (const change of summary.structural) {
		if (change.type === "block-removed") {
			removed.add(change.blockId);
		}
		if (change.type === "blocks-merged") {
			removed.add(change.sourceBlockId);
		}
	}
	for (const change of summary.structural) {
		if (change.type === "block-inserted") {
			removed.delete(change.blockId);
		}
		if (change.type === "block-split") {
			removed.delete(change.newBlockId);
		}
	}
	return removed;
}
