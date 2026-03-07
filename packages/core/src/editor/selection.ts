import type {
	SelectionState,
	PenDocument,
	CRDTDocument,
	CRDTMap,
	SchemaRegistry,
	BlockHandle,
} from "@pen/types";
import { createBlockHandle } from "../schema/handles.js";
import { EventEmitter } from "./events.js";
import { DocumentRangeImpl } from "./range.js";

type CRDTBlockMap = CRDTMap<CRDTMap<unknown>>;
const ZERO_WIDTH_SPACE = "\u200B";

export class SelectionManagerImpl {
	private _selection: SelectionState = null;
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

	getSelection(): SelectionState {
		return this._selection;
	}

	setSelection(selection: SelectionState): void {
		if (selection && !this._validateSelection(selection)) return;
		const prev = this._selection;
		this._selection = selection;
		if (prev !== selection) {
			this._emitter.emit("selectionChange", selection);
		}
	}

	selectBlock(blockId: string): void {
		if (!this._blockExists(blockId)) return;
		this.setSelection({ type: "block", blockIds: [blockId] });
	}

	selectBlocks(blockIds: string[]): void {
		const valid = blockIds.filter((id) => this._blockExists(id));
		if (valid.length === 0) return;
		this.setSelection({ type: "block", blockIds: valid });
	}

	selectTextRange(
		anchor: { blockId: string; offset: number },
		focus: { blockId: string; offset: number },
	): void {
		if (
			!this._blockExists(anchor.blockId) ||
			!this._blockExists(focus.blockId)
		) {
			return;
		}

		const clampedAnchor = {
			blockId: anchor.blockId,
			offset: this._clampOffset(anchor.blockId, anchor.offset),
		};
		const clampedFocus = {
			blockId: focus.blockId,
			offset: this._clampOffset(focus.blockId, focus.offset),
		};
		const range = new DocumentRangeImpl(
			clampedAnchor,
			clampedFocus,
			this._doc,
		);

		this.setSelection(range.toTextSelection());
	}

	selectText(blockId: string, from: number, to: number): void {
		this.selectTextRange(
			{ blockId, offset: from },
			{ blockId, offset: to },
		);
	}

	selectAll(): void {
		const ids: string[] = [];
		for (let i = 0; i < this._doc.blockOrder.length; i++) {
			ids.push(this._doc.blockOrder.get(i) as string);
		}
		if (ids.length > 0) {
			this.setSelection({ type: "block", blockIds: ids });
		}
	}

	getSelectedText(): string {
		const sel = this._selection;
		if (!sel) return "";

		if (sel.type === "text") {
			if (!sel.isMultiBlock) {
				const blockMap = (this._doc.blocks as CRDTBlockMap).get(
					sel.anchor.blockId,
				);
				const content = blockMap?.get("content") as
					| { toString(): string }
					| undefined;
				if (!content || typeof content.toString !== "function")
					return "";
				const raw = content.toString();
				const full = raw === ZERO_WIDTH_SPACE ? "" : raw;
				const from = Math.min(sel.anchor.offset, sel.focus.offset);
				const to = Math.max(sel.anchor.offset, sel.focus.offset);
				return full.slice(from, to);
			}

			const range = sel.toRange();
			const blockIds = range.blockRange;
			const parts = blockIds.map((blockId, index) => {
				const blockMap = (this._doc.blocks as CRDTBlockMap).get(
					blockId,
				);
				const content = blockMap?.get("content") as
					| { toString(): string }
					| undefined;
				if (!content || typeof content.toString !== "function")
					return "";

				const raw = content.toString();
				const full = raw === ZERO_WIDTH_SPACE ? "" : raw;
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
				const handle = createBlockHandle(
					id,
					this._doc,
					this._crdtDoc,
					this._registry,
				);
				parts.push(handle.textContent());
			}
			return parts.join("\n");
		}

		return "";
	}

	getSelectedBlocks(): BlockHandle[] {
		const sel = this._selection;
		if (!sel) return [];

		if (sel.type === "block") {
			return sel.blockIds
				.filter((id) => this._blockExists(id))
				.map((id) =>
					createBlockHandle(
						id,
						this._doc,
						this._crdtDoc,
						this._registry,
					),
				);
		}

		if (sel.type === "text") {
			return sel.blockRange
				.filter((id) => this._blockExists(id))
				.map((id) =>
					createBlockHandle(
						id,
						this._doc,
						this._crdtDoc,
						this._registry,
					),
				);
		}

		return [];
	}

	updateDocument(doc: PenDocument, crdtDoc: CRDTDocument): void {
		this._doc = doc;
		this._crdtDoc = crdtDoc;
		this._selection = null;
	}

	private _validateSelection(sel: SelectionState): boolean {
		if (!sel) return true;
		if (sel.type === "text") return this._blockExists(sel.anchor.blockId);
		if (sel.type === "block")
			return sel.blockIds.every((id) => this._blockExists(id));
		if (sel.type === "app") return true;
		if (sel.type === "cell") return this._blockExists(sel.blockId);
		return false;
	}

	private _blockExists(blockId: string): boolean {
		return (this._doc.blocks as CRDTBlockMap).has(blockId);
	}

	private _clampOffset(blockId: string, offset: number): number {
		const blockMap = (this._doc.blocks as CRDTBlockMap).get(blockId);
		const content = blockMap?.get("content") as
			| { length: number }
			| undefined;
		if (!content || typeof content.length !== "number") return 0;
		return Math.max(0, Math.min(offset, content.length));
	}
}
