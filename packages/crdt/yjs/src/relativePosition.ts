import type {
	AnchorTarget,
	Assoc,
	CRDTDocument,
	ResolveRelativePositionOptions,
} from "@input/pen-types";
import { logicalTextFromStored } from "@input/pen-types";
import * as Y from "yjs";

import { asYjsDoc } from "./document";

type DeletedFlag = { _item?: { deleted?: boolean } | null };

function clampOffset(offset: number, length: number): number {
	if (!Number.isFinite(offset) || offset < 0) {
		return 0;
	}
	return Math.max(0, Math.min(Math.trunc(offset), length));
}

function logicalLength(text: Y.Text): number {
	const stored = text.toString();
	const logical = logicalTextFromStored(stored);
	const embedCount = text.length - stored.length;
	return logical.length + Math.max(0, embedCount);
}

function toYjsIndex(text: Y.Text, logicalOffset: number): number {
	const length = logicalLength(text);
	if (length === 0) {
		return 0;
	}
	return clampOffset(logicalOffset, length);
}

function fromYjsIndex(text: Y.Text, yjsIndex: number): number {
	const length = logicalLength(text);
	if (length === 0) {
		return 0;
	}
	return clampOffset(yjsIndex, length);
}

function isDeletedType(type: object): boolean {
	return (type as DeletedFlag)._item?.deleted === true;
}

function cellText(
	blockMap: Y.Map<unknown>,
	row: number,
	col: number,
): Y.Text | null {
	const table = blockMap.get("tableContent");
	if (!(table instanceof Y.Array)) {
		return null;
	}
	if (row < 0 || row >= table.length) {
		return null;
	}
	const rowMap = table.get(row);
	if (!(rowMap instanceof Y.Map)) {
		return null;
	}
	const cells = rowMap.get("cells");
	if (!(cells instanceof Y.Array)) {
		return null;
	}
	if (col < 0 || col >= cells.length) {
		return null;
	}
	const cell = cells.get(col);
	if (!(cell instanceof Y.Map)) {
		return null;
	}
	const content = cell.get("content");
	return content instanceof Y.Text ? content : null;
}

function textForTarget(
	blocks: Y.Map<Y.Map<unknown>>,
	target: AnchorTarget,
): Y.Text | null {
	const blockMap = blocks.get(target.blockId);
	if (!blockMap) {
		return null;
	}
	if (target.cell) {
		return cellText(blockMap, target.cell.row, target.cell.col);
	}
	const content = blockMap.get("content");
	return content instanceof Y.Text ? content : null;
}

function locateText(
	blocks: Y.Map<Y.Map<unknown>>,
	ytext: object,
): Omit<AnchorTarget, "offset"> | null {
	for (const [blockId, blockMap] of blocks.entries()) {
		if (blockMap.get("content") === ytext) {
			return { blockId };
		}
		const table = blockMap.get("tableContent");
		if (!(table instanceof Y.Array)) {
			continue;
		}
		for (let row = 0; row < table.length; row++) {
			const rowMap = table.get(row);
			if (!(rowMap instanceof Y.Map)) {
				continue;
			}
			const cells = rowMap.get("cells");
			if (!(cells instanceof Y.Array)) {
				continue;
			}
			for (let col = 0; col < cells.length; col++) {
				const cell = cells.get(col);
				if (!(cell instanceof Y.Map)) {
					continue;
				}
				if (cell.get("content") === ytext) {
					return { blockId, cell: { row, col } };
				}
			}
		}
	}
	return null;
}

export function createRelativePosition(
	doc: CRDTDocument,
	target: AnchorTarget,
	assoc: Assoc,
): Uint8Array | null {
	const yjsDoc = asYjsDoc(doc);
	const text = textForTarget(yjsDoc.penDocument.blocks, target);
	if (!text || isDeletedType(text)) {
		return null;
	}
	const yjsAssoc = assoc === -1 ? -1 : 1;
	const relative = Y.createRelativePositionFromTypeIndex(
		text as never,
		toYjsIndex(text, target.offset),
		yjsAssoc,
	);
	return Y.encodeRelativePosition(relative);
}

export function resolveRelativePosition(
	doc: CRDTDocument,
	encoded: Uint8Array,
	options?: ResolveRelativePositionOptions,
): AnchorTarget | null {
	try {
		const yjsDoc = asYjsDoc(doc);
		const relative = Y.decodeRelativePosition(encoded);
		const absolute = Y.createAbsolutePositionFromRelativePosition(
			relative,
			yjsDoc.ydoc,
			options?.followUndoneDeletions ?? true,
		);
		if (!absolute || isDeletedType(absolute.type)) {
			return null;
		}
		const owner = locateText(yjsDoc.penDocument.blocks, absolute.type);
		if (!owner) {
			return null;
		}
		if (!(absolute.type instanceof Y.Text)) {
			return null;
		}
		const offset = fromYjsIndex(absolute.type, absolute.index);
		return owner.cell
			? { blockId: owner.blockId, offset, cell: owner.cell }
			: { blockId: owner.blockId, offset };
	} catch {
		return null;
	}
}
