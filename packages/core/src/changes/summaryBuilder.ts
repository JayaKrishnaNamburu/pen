import type {
	RawCommitDelta,
	StructuralOriginTag,
	YArrayDelta,
	YTextDelta,
} from "@input/pen-crdt-yjs";
import { EMPTY_BLOCK_SENTINEL } from "@input/pen-types";

import type { BlockIndexSnapshot } from "./blockIndex";
import { createChangeSummary } from "./mapping";
import { mergeSplices } from "./spliceCompose";
import type {
	BlockTextChange,
	ChangeSummary,
	StructuralChange,
	TextSplice,
} from "./types";

const SENTINEL = EMPTY_BLOCK_SENTINEL;

const IGNORABLE_BLOCK_KEYS = new Set(["content", "children", "type"]);
const TABLE_KEYS = new Set(["tableColumns", "tableContent", "rows", "cells"]);

export function logicalLengthFromStored(stored: string): number {
	return stored === SENTINEL ? 0 : stored.length;
}

export function buildChangeSummary(
	delta: RawCommitDelta,
	index: BlockIndexSnapshot,
	commitId: number,
): ChangeSummary {
	const structuralOrigin = readStructuralOrigin(delta.originTag);
	const text = buildTextChanges(delta, index);
	const structural = buildStructuralChanges(delta, index, structuralOrigin);
	return createChangeSummary({
		commitId,
		originType: originTypeFromTag(delta.originTag),
		text,
		structural,
		index,
	});
}

function buildTextChanges(
	delta: RawCommitDelta,
	index: BlockIndexSnapshot,
): BlockTextChange[] {
	const changes: BlockTextChange[] = [];
	for (const [blockId, textDeltaList] of delta.textDeltas) {
		for (const textDelta of textDeltaList) {
			const logicalLength = logicalLengthForTextDelta(blockId, textDelta, index);
			const { splices, formatRanges } = textDeltaToSplices(
				textDelta,
				logicalLength,
			);
			if (splices.length === 0 && formatRanges.length === 0) continue;
			changes.push({ blockId, splices, formatRanges });
		}
	}
	return changes;
}

function logicalLengthForTextDelta(
	blockId: string,
	textDelta: YTextDelta,
	index: BlockIndexSnapshot,
): number {
	const storedLength = index.lengthById.get(blockId) ?? 0;
	if (storedLength > 0) return storedLength;
	if (index.typeById.get(blockId) !== "table") return storedLength;
	return preCommitLengthFromTextDelta(textDelta);
}

function preCommitLengthFromTextDelta(delta: YTextDelta): number {
	let length = 0;
	for (const op of delta) {
		if (op.retain != null) {
			length += op.retain;
			continue;
		}
		if (op.delete != null) {
			length += op.delete;
		}
	}
	return length;
}

export function textDeltaToSplices(
	delta: YTextDelta,
	logicalLength: number,
): { splices: TextSplice[]; formatRanges: { from: number; to: number }[] } {
	const deletes: { from: number; to: number }[] = [];
	const inserts: { at: number; text: string; embed: boolean }[] = [];
	const formatRanges: { from: number; to: number }[] = [];
	let pos = 0;

	for (const op of delta) {
		if (op.retain != null) {
			if (op.attributes) {
				formatRanges.push({ from: pos, to: pos + op.retain });
			}
			pos += op.retain;
			continue;
		}
		if (op.delete != null) {
			deletes.push({ from: pos, to: pos + op.delete });
			pos += op.delete;
			continue;
		}
		if (op.insert !== undefined) {
			if (typeof op.insert === "string") {
				inserts.push({ at: pos, text: op.insert, embed: false });
			} else {
				inserts.push({ at: pos, text: "", embed: true });
			}
		}
	}

	let nextDeletes = deletes;
	let nextInserts = inserts;
	if (logicalLength === 0) {
		nextDeletes = [];
		nextInserts = inserts
			.filter((insert) => insert.embed || insert.text !== SENTINEL)
			.map((insert) => ({ ...insert, at: 0 }));
	}

	const deletedCount = nextDeletes.reduce((sum, item) => sum + (item.to - item.from), 0);
	const onlySentinelInserts =
		nextInserts.length > 0 &&
		nextInserts.every((insert) => !insert.embed && insert.text === SENTINEL);
	if (deletedCount >= logicalLength && onlySentinelInserts) {
		nextInserts = [];
	}

	const splices: TextSplice[] = [
		...nextDeletes.map((item) => ({
			from: item.from,
			to: item.to,
			insertLength: 0,
		})),
		...nextInserts.map((item) => ({
			from: item.at,
			to: item.at,
			insertLength: item.embed ? 1 : item.text.length,
		})),
	];

	return {
		splices: mergeSplices(splices),
		formatRanges,
	};
}

function buildStructuralChanges(
	delta: RawCommitDelta,
	index: BlockIndexSnapshot,
	structuralOrigin: StructuralOriginTag | null,
): StructuralChange[] {
	const structural: StructuralChange[] = [];
	const { inserted, removed } = collectArrayEdits(delta, index);

	const insertedIds = new Set(inserted.map((item) => item.id));
	const removedIds = new Set(removed.map((item) => item.id));
	const splitNewId = structuralOrigin?.kind === "split" ? structuralOrigin.newBlockId : null;
	const mergeSourceId =
		structuralOrigin?.kind === "merge" ? structuralOrigin.sourceBlockId : null;

	if (structuralOrigin?.kind === "split") {
		structural.push({
			type: "block-split",
			blockId: structuralOrigin.blockId,
			newBlockId: structuralOrigin.newBlockId,
			offset: structuralOrigin.offset,
		});
	}
	if (structuralOrigin?.kind === "merge") {
		structural.push({
			type: "blocks-merged",
			targetBlockId: structuralOrigin.targetBlockId,
			sourceBlockId: structuralOrigin.sourceBlockId,
			joinOffset: index.lengthById.get(structuralOrigin.targetBlockId) ?? 0,
		});
	}

	for (const item of inserted) {
		if (item.id === splitNewId) continue;
		if (removedIds.has(item.id) || index.parentById.has(item.id)) {
			const fromParentId = index.parentById.get(item.id) ?? null;
			const fromIndex = (
				index.childrenByParentId.get(fromParentId) ?? []
			).indexOf(item.id);
			if (fromParentId === item.parentId && fromIndex === item.index) continue;
			structural.push({
				type: "block-moved",
				blockId: item.id,
				fromParentId,
				fromIndex: Math.max(0, fromIndex),
				toParentId: item.parentId,
				toIndex: item.index,
			});
			continue;
		}
		structural.push({
			type: "block-inserted",
			blockId: item.id,
			parentId: item.parentId,
			index: item.index,
		});
	}

	for (const item of removed) {
		if (item.id === mergeSourceId) continue;
		if (insertedIds.has(item.id)) continue;
		if (item.id === splitNewId) continue;
		structural.push({
			type: "block-removed",
			blockId: item.id,
			parentId: item.parentId,
			index: item.index,
		});
	}

	const newIds = new Set<string>([
		...inserted.filter((item) => !index.parentById.has(item.id)).map((item) => item.id),
		...(splitNewId ? [splitNewId] : []),
	]);

	for (const [blockId, keys] of delta.blockMapChanges) {
		if (newIds.has(blockId)) continue;
		const keyList = [...keys];
		const fromType = index.typeById.get(blockId) ?? "";
		if (keyList.includes("type")) {
			structural.push({
				type: "block-converted",
				blockId,
				fromType,
				toType: fromType,
			});
		}

		const residual = keyList.filter((key) => !IGNORABLE_BLOCK_KEYS.has(key));
		if (residual.length === 0) continue;

		const looksTable =
			fromType === "table" || residual.some((key) => TABLE_KEYS.has(key));
		if (looksTable) {
			structural.push({ type: "table-changed", blockId });
		} else {
			structural.push({
				type: "block-props-changed",
				blockId,
				keys: residual,
			});
		}
	}

	if (delta.appChanges.size > 0) {
		structural.push({
			type: "apps-changed",
			appIds: [...delta.appChanges],
		});
	}
	if (delta.metadataChanges.size > 0) {
		structural.push({
			type: "metadata-changed",
			namespaces: [...delta.metadataChanges],
		});
	}

	return structural;
}

function collectArrayEdits(
	delta: RawCommitDelta,
	index: BlockIndexSnapshot,
): {
	inserted: { id: string; parentId: string | null; index: number }[];
	removed: { id: string; parentId: string | null; index: number }[];
} {
	const inserted: { id: string; parentId: string | null; index: number }[] = [];
	const removed: { id: string; parentId: string | null; index: number }[] = [];

	const rootEdits = interpretArrayDelta(index.roots, delta.blockOrderDelta);
	inserted.push(...rootEdits.inserted.map((item) => ({ ...item, parentId: null })));
	removed.push(...rootEdits.removed.map((item) => ({ ...item, parentId: null })));

	for (const [parentId, arrayDelta] of delta.childArrayDeltas) {
		const pre = index.childrenByParentId.get(parentId) ?? [];
		const edits = interpretArrayDelta(pre, arrayDelta);
		inserted.push(...edits.inserted.map((item) => ({ ...item, parentId })));
		removed.push(...edits.removed.map((item) => ({ ...item, parentId })));
	}

	return { inserted, removed };
}

function interpretArrayDelta(
	pre: readonly string[],
	delta: YArrayDelta,
): { inserted: { id: string; index: number }[]; removed: { id: string; index: number }[] } {
	const inserted: { id: string; index: number }[] = [];
	const removed: { id: string; index: number }[] = [];
	let oldIndex = 0;
	let newIndex = 0;

	for (const op of delta) {
		if (op.retain != null) {
			oldIndex += op.retain;
			newIndex += op.retain;
			continue;
		}
		if (op.delete != null) {
			for (let i = 0; i < op.delete; i++) {
				const id = pre[oldIndex];
				if (id != null) removed.push({ id, index: oldIndex });
				oldIndex += 1;
			}
			continue;
		}
		if (op.insert) {
			for (const value of op.insert) {
				if (typeof value === "string") {
					inserted.push({ id: value, index: newIndex });
					newIndex += 1;
				}
			}
		}
	}

	return { inserted, removed };
}

function originTypeFromTag(tag: unknown): string {
	if (typeof tag === "string" && tag.length > 0) return tag;
	if (tag != null && typeof tag === "object" && "type" in tag) {
		const type = (tag as { type?: unknown }).type;
		if (typeof type === "string" && type.length > 0) return type;
	}
	return "user";
}

function readStructuralOrigin(tag: unknown): StructuralOriginTag | null {
	if (tag == null || typeof tag !== "object") return null;
	const structural = (tag as { structural?: unknown }).structural;
	if (!isStructuralOriginTag(structural)) return null;
	return structural;
}

function isStructuralOriginTag(value: unknown): value is StructuralOriginTag {
	if (value == null || typeof value !== "object") return false;
	const kind = (value as { kind?: unknown }).kind;
	return kind === "split" || kind === "merge";
}
