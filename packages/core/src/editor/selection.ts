import type {
	Anchor,
	BlockHandle,
	BlockSelection,
	CellSelection,
	ChangeSummary,
	CRDTDocument,
	CRDTMap,
	DiagnosticEvent,
	Editor,
	PenDocument,
	Point,
	SchemaRegistry,
	Assoc,
	SelectionOrigin,
	SelectionRecord,
	SelectionRecordState,
	SelectionState,
	TextSelection,
} from "@input/pen-types";
import { logicalTextFromStored } from "@input/pen-types";
import { usesInlineTextSelection } from "../schema/fieldEditorCapabilities";
import { createBlockHandle } from "../schema/handles";
import {
	getSelectionBlockRange,
	selectionToRange,
	stampTextSelection,
} from "../selection/helpers";
import { deriveContentMoves, repairAnchor } from "./anchorRepair";
import type { EditorAnchorsImpl } from "./anchors";
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
	onCommit(summary: ChangeSummary): void;
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
	private readonly _anchors: EditorAnchorsImpl;
	private _editor: Editor | null = null;
	private _fromAnchor: Anchor | null = null;
	private _toAnchor: Anchor | null = null;

	constructor(
		doc: PenDocument,
		crdtDoc: CRDTDocument,
		registry: SchemaRegistry,
		emitter: EventEmitter,
		anchors: EditorAnchorsImpl,
	) {
		this._doc = doc;
		this._crdtDoc = crdtDoc;
		this._registry = registry;
		this._emitter = emitter;
		this._anchors = anchors;
	}

	bindEditor(editor: Editor): void {
		this._editor = editor;
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

	onCommit(summary: ChangeSummary): void {
		this._repairHeldAnchors(summary);
		const resolved = this._resolveHeldText();
		if (resolved !== undefined && !selectionEquals(this._state, resolved)) {
			this._accept(resolved, "mapped", summary.commitId, { emit: false });
			return;
		}
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
		this._fromAnchor = null;
		this._toAnchor = null;
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
		this._mintTextAnchors(validated);
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
		summary: ChangeSummary,
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
		summary: ChangeSummary,
	): SelectionState | undefined {
		const collapsed = isCollapsedRange(state);
		const anchor = this._fallbackPoint(
			state.anchor,
			summary,
			collapsed ? 1 : -1,
		);
		const focus = this._fallbackPoint(state.focus, summary, 1);
		if (!anchor || !focus) {
			return null;
		}
		const next = stampTextSelection(this._doc, {
			anchor,
			focus,
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
		summary: ChangeSummary,
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
		const point = this._fallbackForRemovedBlock(firstDeleted, summary);
		if (!point) {
			return null;
		}
		return stampTextSelection(this._doc, {
			anchor: point,
			focus: point,
		});
	}

	private _mapCell(
		state: CellSelection,
		summary: ChangeSummary,
	): SelectionState | undefined {
		const tableChanged = summary.structural.some(
			(change) =>
				change.type === "table-changed" &&
				change.blockId === state.blockId,
		);
		if (tableChanged) {
			return {
				type: "cell",
				blockId: state.blockId,
				anchor: { row: 0, col: 0 },
				head: { row: 0, col: 0 },
			};
		}

		if (removedBlockIds(summary).has(state.blockId)) {
			const point = this._fallbackForRemovedBlock(state.blockId, summary);
			if (!point) {
				return null;
			}
			return stampTextSelection(this._doc, {
				anchor: point,
				focus: point,
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

	private _mintTextAnchors(state: SelectionState): void {
		if (!state || state.type !== "text") {
			this._fromAnchor = null;
			this._toAnchor = null;
			return;
		}
		if (
			this._isNonTextBlock(state.anchor.blockId) ||
			this._isNonTextBlock(state.focus.blockId)
		) {
			this._fromAnchor = null;
			this._toAnchor = null;
			return;
		}
		const collapsed = isCollapsedRange(state);
		this._fromAnchor = this._anchors.create(
			state.anchor,
			collapsed ? 1 : -1,
		);
		this._toAnchor = this._anchors.create(state.focus, 1);
	}

	private _repairHeldAnchors(summary: ChangeSummary): void {
		if (!this._editor || !this._fromAnchor || !this._toAnchor) {
			return;
		}
		const moves = deriveContentMoves(summary, undefined);
		if (moves.length === 0) {
			return;
		}
		this._fromAnchor = repairAnchor(this._editor, this._fromAnchor, moves);
		this._toAnchor = repairAnchor(this._editor, this._toAnchor, moves);
	}

	private _resolveHeldText(): TextSelection | undefined {
		if (
			this._state?.type !== "text" ||
			!this._fromAnchor ||
			!this._toAnchor
		) {
			return undefined;
		}
		const from = this._anchors.resolve(this._fromAnchor);
		const to = this._anchors.resolve(this._toAnchor);
		if (!from || !to) {
			return undefined;
		}
		return stampTextSelection(this._doc, {
			anchor: from,
			focus: to,
			affinity: this._state.affinity,
			goalX: this._state.goalX,
		});
	}

	private _fallbackPoint(
		original: Point,
		summary: ChangeSummary,
		assoc: Assoc,
	): Point | null {
		const addressed = readdressThroughStructural(
			original,
			summary.structural,
			assoc,
		);
		if (!this._blockExists(addressed.blockId)) {
			return this._fallbackForRemovedBlock(original.blockId, summary);
		}
		if (addressed.blockId !== original.blockId) {
			return {
				blockId: addressed.blockId,
				offset: clampOffsetToLength(
					addressed.offset,
					this._logicalLength(addressed.blockId),
				),
			};
		}
		const textChange = summary.text.find(
			(change) => change.blockId === addressed.blockId,
		);
		const offset =
			textChange && textChange.splices.length > 0
				? shiftThroughSplices(textChange.splices, addressed.offset, assoc)
				: addressed.offset;
		return {
			blockId: addressed.blockId,
			offset: clampOffsetToLength(
				offset,
				this._logicalLength(addressed.blockId),
			),
		};
	}

	private _fallbackForRemovedBlock(
		blockId: string,
		summary: ChangeSummary,
	): Point | null {
		for (const change of summary.structural) {
			if (
				change.type === "blocks-merged" &&
				change.sourceBlockId === blockId
			) {
				if (!this._blockExists(change.targetBlockId)) {
					break;
				}
				return {
					blockId: change.targetBlockId,
					offset: clampOffsetToLength(
						change.joinOffset,
						this._logicalLength(change.targetBlockId),
					),
				};
			}
		}
		const removed = summary.structural.find(
			(change) =>
				change.type === "block-removed" && change.blockId === blockId,
		);
		if (removed && removed.type === "block-removed") {
			const siblings = liveChildIds(this._doc, removed.parentId);
			const nextId = siblings[removed.index];
			if (nextId && this._blockExists(nextId)) {
				return { blockId: nextId, offset: 0 };
			}
			const previousId = siblings[removed.index - 1];
			if (previousId && this._blockExists(previousId)) {
				return {
					blockId: previousId,
					offset: this._logicalLength(previousId),
				};
			}
			if (removed.parentId && this._blockExists(removed.parentId)) {
				return { blockId: removed.parentId, offset: 0 };
			}
		}
		const first = liveChildIds(this._doc, null)[0];
		if (first && this._blockExists(first)) {
			return { blockId: first, offset: 0 };
		}
		return null;
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

function readdressThroughStructural(
	point: Point,
	structural: ChangeSummary["structural"],
	assoc: Assoc,
): Point {
	let current = point;
	for (const change of structural) {
		if (
			change.type === "blocks-merged" &&
			current.blockId === change.sourceBlockId
		) {
			current = {
				blockId: change.targetBlockId,
				offset: change.joinOffset + current.offset,
			};
			continue;
		}
		if (change.type === "block-split" && current.blockId === change.blockId) {
			if (current.offset > change.offset) {
				current = {
					blockId: change.newBlockId,
					offset: current.offset - change.offset,
				};
			} else if (current.offset === change.offset && assoc === 1) {
				current = { blockId: change.newBlockId, offset: 0 };
			}
		}
	}
	return current;
}

function shiftThroughSplices(
	splices: readonly { from: number; to: number; insertLength: number }[],
	offset: number,
	assoc: Assoc,
): number {
	let delta = 0;
	for (const splice of splices) {
		const deleted = splice.to - splice.from;
		if (offset < splice.from) {
			return offset + delta;
		}
		if (splice.from < offset && offset < splice.to) {
			return splice.from + delta;
		}
		if (offset === splice.from) {
			if (splice.insertLength > 0) {
				return assoc === -1
					? splice.from + delta
					: splice.from + delta + splice.insertLength;
			}
			if (deleted > 0) {
				return splice.from + delta;
			}
			continue;
		}
		if (offset === splice.to && deleted > 0) {
			return splice.from + delta + splice.insertLength;
		}
		delta += splice.insertLength - deleted;
	}
	return offset + delta;
}

function liveChildIds(doc: PenDocument, parentId: string | null): string[] {
	if (parentId === null) {
		return readIdArray(doc.blockOrder);
	}
	const block = (doc.blocks as CRDTBlockMap).get(parentId);
	return readIdArray(block?.get("children"));
}

function readIdArray(value: unknown): string[] {
	if (
		value == null ||
		typeof (value as { length?: unknown }).length !== "number" ||
		typeof (value as { get?: unknown }).get !== "function"
	) {
		return [];
	}
	const arr = value as { length: number; get: (index: number) => unknown };
	const ids: string[] = [];
	for (let i = 0; i < arr.length; i++) {
		const id = arr.get(i);
		if (typeof id === "string") {
			ids.push(id);
		}
	}
	return ids;
}

function removedBlockIds(summary: ChangeSummary): Set<string> {
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
