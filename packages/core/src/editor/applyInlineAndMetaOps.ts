import type {
	AppOp,
	FormatTextOp,
	GridOp,
	InlineInsert,
	SetMetaOp,
	SpliceTextOp,
} from "@input/pen-types";
import {
	type CRDTInlineTextLike,
	type CRDTTextLike,
	type CRDTUnknownMap,
	getTableContent,
} from "./crdtShapes";
import type { ApplyPipelineDocumentAccess } from "./applyPipelineContext";
import { rejectedOwnPropKeys } from "./rejectedOwnKeys";
import {
	ensureCellContent,
	getCellContent,
} from "./tableGridCellHelpers";
import {
	createMutableMap,
	getInlineTextContent,
	getMutableAppMap,
	getMutableBlockMap,
	getOrCreateMapProp,
	getTextContent,
} from "./applySharedHelpers";

type MutableMap = CRDTUnknownMap & { delete(key: string): void };

// sentinel-storage: empty-block caret target in Y.Text. Not a logical character.

function embedRecordFromAtom(atom: {
	nodeType: string;
	props: Record<string, unknown>;
}): Record<string, unknown> {
	const embed = Object.create(null) as Record<string, unknown>;
	if (atom.props) {
		for (const key of Object.keys(atom.props)) {
			embed[key] = atom.props[key];
		}
	}
	embed.type = atom.nodeType;
	return embed;
}

function flattenInsert(
	insert: InlineInsert | readonly InlineInsert[],
): InlineInsert[] {
	if (Array.isArray(insert)) {
		return [...insert];
	}
	return [insert as InlineInsert];
}

function resolveBlockText(
	pipeline: ApplyPipelineDocumentAccess,
	blockId: string,
): { blockMap: MutableMap; content: CRDTTextLike } | null {
	const blockMap = getMutableBlockMap(pipeline, blockId);
	if (!blockMap) return null;
	const content = getTextContent(pipeline, blockMap);
	if (!content) return null;
	return { blockMap, content };
}

function resolveCellText(
	pipeline: ApplyPipelineDocumentAccess,
	blockId: string,
	cell: { row: number; col: number },
	forInsert: boolean,
): CRDTTextLike | null {
	const blockMap = getMutableBlockMap(pipeline, blockId);
	if (!blockMap) return null;
	const tableContent = getTableContent(blockMap);
	if (!tableContent) return null;
	if (forInsert) {
		return (
			ensureCellContent(
				tableContent.get(cell.row),
				cell.col,
				() => pipeline._tableGrid.createTableCell(),
			) ?? null
		);
	}
	return getCellContent(tableContent.get(cell.row), cell.col) as CRDTTextLike | null;
}

function emitClamped(
	pipeline: ApplyPipelineDocumentAccess,
	op: SpliceTextOp | FormatTextOp,
	from: number,
	to: number,
): void {
	pipeline._emitter.emit("diagnostic", {
		code: "op-clamped",
		level: "warn",
		source: "apply",
		message: `apply: clamped ${op.type} offsets to [${from}, ${to}]`,
		op,
	});
}

function clampRange(
	pipeline: ApplyPipelineDocumentAccess,
	op: SpliceTextOp | FormatTextOp,
	length: number,
	from: number,
	to: number,
): { from: number; to: number } {
	const nextFrom = Math.max(0, Math.min(from, length));
	const nextTo = Math.max(nextFrom, Math.min(to, length));
	if (nextFrom !== from || nextTo !== to) {
		emitClamped(pipeline, op, nextFrom, nextTo);
	}
	return { from: nextFrom, to: nextTo };
}

function insertItems(
	pipeline: ApplyPipelineDocumentAccess,
	content: CRDTTextLike,
	offset: number,
	items: readonly InlineInsert[],
	marks: Record<string, unknown | null> | undefined,
	op: SpliceTextOp,
): boolean {
	let pos = offset;
	const resolvedMarks = marks ? resolveMarks(pipeline, marks) : undefined;
	for (const item of items) {
		if (typeof item === "string") {
			if (item.length === 0) {
				continue;
			}
			content.insert(pos, item, resolvedMarks);
			pos += item.length;
			continue;
		}
		const rejectedKeys = rejectedOwnPropKeys(item.props);
		if (rejectedKeys.length > 0) {
			pipeline._emitter.emit("diagnostic", {
				code: "PEN_APPLY_009",
				level: "warn",
				source: "apply",
				message: `apply: rejected prototype keys in splice-text atom props (${rejectedKeys.join(", ")})`,
				remediation:
					"Remove __proto__, constructor, and prototype own keys from op props.",
				op,
			});
			return false;
		}
		const inline = content as CRDTInlineTextLike;
		if (typeof inline.insertEmbed !== "function") {
			return false;
		}
		inline.insertEmbed(pos, embedRecordFromAtom(item));
		pos += 1;
	}
	return true;
}

export function spliceText(
	pipeline: ApplyPipelineDocumentAccess,
	op: SpliceTextOp,
): string[] {
	const items = flattenInsert(op.insert);
	const insertingAnything = items.some((item) =>
		typeof item === "string" ? item.length > 0 : true,
	);

	if (op.cell) {
		const content = resolveCellText(
			pipeline,
			op.blockId,
			op.cell,
			insertingAnything,
		);
		if (!content) return [];
		const range = clampRange(pipeline, op, content.length, op.from, op.to);
		if (range.to > range.from) {
			content.delete(range.from, range.to - range.from);
		}
		if (insertingAnything) {
			insertItems(pipeline, content, range.from, items, op.marks, op);
		}
		return [op.blockId];
	}

	const resolved = resolveBlockText(pipeline, op.blockId);
	if (!resolved) return [];
	const { content } = resolved;

	const range = clampRange(pipeline, op, content.length, op.from, op.to);
	if (range.to > range.from) {
		content.delete(range.from, range.to - range.from);
	}
	if (insertingAnything) {
		if (items.length === 1 && typeof items[0] === "object") {
			const inline = getInlineTextContent(pipeline, resolved.blockMap);
			if (!inline) return [];
			insertItems(pipeline, inline, range.from, items, op.marks, op);
		} else {
			insertItems(pipeline, content, range.from, items, op.marks, op);
		}
	}
	return [op.blockId];
}

export function formatText(
	pipeline: ApplyPipelineDocumentAccess,
	op: FormatTextOp,
): string[] {
	const content = op.cell
		? resolveCellText(pipeline, op.blockId, op.cell, false)
		: resolveBlockText(pipeline, op.blockId)?.content;
	if (!content) return [];
	const range = clampRange(pipeline, op, content.length, op.from, op.to);
	if (range.to > range.from) {
		content.format(range.from, range.to - range.from, op.marks);
	}
	return [op.blockId];
}

function resolveMarks(
	pipeline: Pick<ApplyPipelineDocumentAccess, "_registry">,
	marks: Record<string, unknown | null>,
): Record<string, unknown | null> {
	const resolved: Record<string, unknown | null> = {};
	for (const [type, value] of Object.entries(marks)) {
		const schema = pipeline._registry.resolveInline(type);
		if (!schema) continue;
		resolved[type] = value;
	}
	return resolved;
}

export function applyApp(
	pipeline: ApplyPipelineDocumentAccess,
	op: AppOp,
): string[] {
	const change = op.change;
	switch (change.kind) {
		case "create": {
			const appMap = createMutableMap(pipeline);
			appMap.set("type", change.appType);
			appMap.set("placement", change.placement);
			if (change.config && Object.keys(change.config).length > 0) {
				const configMap = createMutableMap(pipeline);
				for (const [key, value] of Object.entries(change.config)) {
					configMap.set(key, value);
				}
				appMap.set("config", configMap);
			}
			pipeline.mutableApps.set(change.appId, appMap);
			return [];
		}
		case "update": {
			const appMap = getMutableAppMap(pipeline, change.appId);
			if (!appMap) return [];
			const configMap = getOrCreateMapProp(pipeline, appMap, "config");
			for (const [key, value] of Object.entries(change.patch)) {
				if (value === undefined || value === null) {
					configMap.delete(key);
				} else {
					configMap.set(key, value);
				}
			}
			return [];
		}
		case "delete": {
			pipeline.mutableApps.delete(change.appId);
			return [];
		}
		default: {
			const _exhaustive: never = change;
			return _exhaustive;
		}
	}
}

export function tableOp(
	pipeline: ApplyPipelineDocumentAccess,
	op: GridOp,
): string[] {
	const blockMap = getMutableBlockMap(pipeline, op.blockId);
	if (!blockMap) return [];
	return pipeline._tableGrid.execute(blockMap, op);
}

export function clearTableState(blockMap: MutableMap): void {
	blockMap.delete("tableContent");
	blockMap.delete("tableColumns");
}

export function getPreservedInlineDeltas(
	content: CRDTTextLike | undefined,
): Array<{ insert: string; attributes?: Record<string, unknown> }> {
	if (!content || typeof content.toDelta !== "function") {
		return [];
	}
	return content.toDelta().filter(
		(
			delta,
		): delta is { insert: string; attributes?: Record<string, unknown> } =>
			typeof delta.insert === "string",
	);
}

export function setMeta(
	pipeline: ApplyPipelineDocumentAccess,
	op: SetMetaOp,
): string[] {
	const blockMap = getMutableBlockMap(pipeline, op.blockId);
	if (!blockMap) return [];

	const metaMap = getOrCreateMapProp(pipeline, blockMap, "meta");

	if (op.data === null) {
		metaMap.delete(op.namespace);
	} else {
		metaMap.set(op.namespace, op.data);
	}

	return [op.blockId];
}
