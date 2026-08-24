import type {
	AppOp,
	FormatTextOp,
	GridOp,
	InlineInsert,
	SetMetaOp,
	SpliceTextOp,
} from "@input/pen-types";
import {
	type CRDTUnknownMap,
	getTableContent,
} from "./crdtShapes";
import type { ApplyPipeline } from "./apply";
import { rejectedOwnPropKeys } from "./rejectedOwnKeys";
import {
	ensureCellContent,
	getCellContent,
} from "./tableGridCellHelpers";

type ApplyPipelineRuntime = any;
type MutableMap = CRDTUnknownMap & { delete(key: string): void };

interface CRDTInlineText extends CRDTText {
	insertEmbed(offset: number, value: Record<string, unknown>): void;
}
interface CRDTText {
	insert(
		offset: number,
		text: string,
		attributes?: Record<string, unknown | null>,
	): void;
	delete(offset: number, length: number): void;
	format(
		offset: number,
		length: number,
		attributes: Record<string, unknown>,
	): void;
	toDelta(): Array<{
		insert: string | object;
		attributes?: Record<string, unknown>;
	}>;
	toString(): string;
	readonly length: number;
}

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

function insertHasString(items: readonly InlineInsert[]): boolean {
	return items.some((item) => typeof item === "string" && item.length > 0);
}

function resolveBlockText(
	pipeline: ApplyPipelineRuntime,
	blockId: string,
): { blockMap: MutableMap; content: CRDTText } | null {
	const blockMap = pipeline._getMutableBlockMap(blockId);
	if (!blockMap) return null;
	const content = pipeline._getTextContent(blockMap);
	if (!content) return null;
	return { blockMap, content };
}

function resolveCellText(
	pipeline: ApplyPipelineRuntime,
	blockId: string,
	cell: { row: number; col: number },
	forInsert: boolean,
): CRDTText | null {
	const blockMap = pipeline._getMutableBlockMap(blockId);
	if (!blockMap) return null;
	const tableContent = getTableContent(blockMap);
	if (!tableContent) return null;
	if (forInsert) {
		return (ensureCellContent(
			tableContent.get(cell.row),
			cell.col,
			() => pipeline._tableGrid.createTableCell(),
		) ?? null) as CRDTText | null;
	}
	return getCellContent(tableContent.get(cell.row), cell.col) as CRDTText | null;
}

function emitClamped(
	pipeline: ApplyPipelineRuntime,
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
	pipeline: ApplyPipelineRuntime,
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
	pipeline: ApplyPipelineRuntime,
	content: CRDTText,
	offset: number,
	items: readonly InlineInsert[],
	marks: Record<string, unknown | null> | undefined,
	op: SpliceTextOp,
): boolean {
	let pos = offset;
	const resolvedMarks = marks ? pipeline._resolveMarks(marks) : undefined;
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
		const inline = content as CRDTInlineText;
		if (typeof inline.insertEmbed !== "function") {
			return false;
		}
		inline.insertEmbed(pos, embedRecordFromAtom(item));
		pos += 1;
	}
	return true;
}

export function spliceText(pipeline: ApplyPipeline, op: SpliceTextOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
	const items = flattenInsert(op.insert);
	const insertingString = insertHasString(items);
	const insertingAnything = items.some((item) =>
		typeof item === "string" ? item.length > 0 : true,
	);

	if (op.cell) {
		const content = resolveCellText(
			self,
			op.blockId,
			op.cell,
			insertingAnything,
		);
		if (!content) return [];
		const range = clampRange(self, op, content.length, op.from, op.to);
		if (range.to > range.from) {
			content.delete(range.from, range.to - range.from);
		}
		if (insertingAnything) {
			insertItems(self, content, range.from, items, op.marks, op);
		}
		return [op.blockId];
	}

	const resolved = resolveBlockText(self, op.blockId);
	if (!resolved) return [];
	const { content } = resolved;

	const range = clampRange(self, op, content.length, op.from, op.to);
	if (range.to > range.from) {
		content.delete(range.from, range.to - range.from);
	}
	if (insertingAnything) {
		if (items.length === 1 && typeof items[0] === "object") {
			const inline = self._getInlineTextContent(
				resolved.blockMap,
			) as CRDTInlineText | undefined;
			if (!inline) return [];
			insertItems(self, inline, range.from, items, op.marks, op);
		} else {
			insertItems(self, content, range.from, items, op.marks, op);
		}
	}
	return [op.blockId];
}

export function formatText(pipeline: ApplyPipeline, op: FormatTextOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
	const content = op.cell
		? resolveCellText(self, op.blockId, op.cell, false)
		: resolveBlockText(self, op.blockId)?.content;
	if (!content) return [];
	const range = clampRange(self, op, content.length, op.from, op.to);
	if (range.to > range.from) {
		content.format(range.from, range.to - range.from, op.marks);
	}
	return [op.blockId];
}

export function resolveMarks(
	pipeline: ApplyPipeline,
	marks: Record<string, unknown | null>,
): Record<string, unknown | null> {
	const self = pipeline as ApplyPipelineRuntime;
	const resolved: Record<string, unknown | null> = {};
	for (const [type, value] of Object.entries(marks)) {
		const schema = self._registry.resolveInline(type);
		if (!schema) continue;
		resolved[type] = value;
	}
	return resolved;
}

export function applyApp(pipeline: ApplyPipeline, op: AppOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
	const change = op.change;
	switch (change.kind) {
		case "create": {
			const appMap = self._createMutableMap();
			appMap.set("type", change.appType);
			appMap.set("placement", change.placement);
			if (change.config && Object.keys(change.config).length > 0) {
				const configMap = self._createMutableMap();
				for (const [key, value] of Object.entries(change.config)) {
					configMap.set(key, value);
				}
				appMap.set("config", configMap);
			}
			self.mutableApps.set(change.appId, appMap);
			return [];
		}
		case "update": {
			const appMap = self._getMutableAppMap(change.appId);
			if (!appMap) return [];
			const configMap = self._getOrCreateMapProp(appMap, "config");
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
			self.mutableApps.delete(change.appId);
			return [];
		}
		default: {
			const _exhaustive: never = change;
			return _exhaustive;
		}
	}
}

export function tableOp(pipeline: ApplyPipeline, op: GridOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
	const blockMap = self._getMutableBlockMap(op.blockId);
	if (!blockMap) return [];
	return self._tableGrid.execute(blockMap, op);
}

export function clearTableState(
	_pipeline: ApplyPipeline,
	blockMap: MutableMap,
): void {
	blockMap.delete("tableContent");
	blockMap.delete("tableColumns");
}

export function getPreservedInlineDeltas(
	_pipeline: ApplyPipeline,
	content: CRDTText | undefined,
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

export function setMeta(pipeline: ApplyPipeline, op: SetMetaOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
	const blockMap = self._getMutableBlockMap(op.blockId);
	if (!blockMap) return [];

	const metaMap = self._getOrCreateMapProp(blockMap, "meta");

	if (op.data === null) {
		metaMap.delete(op.namespace);
	} else {
		metaMap.set(op.namespace, op.data);
	}

	return [op.blockId];
}
