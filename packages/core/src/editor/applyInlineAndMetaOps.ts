import type {
	DocumentOp,
	OpOrigin,
	InsertBlockOp,
	UpdateBlockOp,
	DeleteBlockOp,
	MoveBlockOp,
	ConvertBlockOp,
	SplitBlockOp,
	MergeBlocksOp,
	InsertTextOp,
	DeleteTextOp,
	FormatTextOp,
	ReplaceTextOp,
	InsertInlineNodeOp,
	RemoveInlineNodeOp,
	UpdateLayoutOp,
	SetMetaOp,
	CreateAppOp,
	UpdateAppOp,
	DeleteAppOp,
	SetSelectionOp,
	CRDTArray,
} from "@input/pen-types";
import { EMPTY_BLOCK_SENTINEL, generateId } from "@input/pen-types";
import { resolveRuntimeContentType } from "../schema/contentType";
import {
	type CRDTUnknownArray,
	type CRDTUnknownMap,
	getArrayProp,
	getMapProp,
	getStringProp,
	getTableColumns,
	getTableContent,
	isCRDTMap,
} from "./crdtShapes";
import type { ApplyPipeline } from "./apply";
import { rejectedOwnPropKeys } from "./rejectedOwnKeys";

type ApplyPipelineRuntime = any;
type MutableMap = CRDTUnknownMap & { delete(key: string): void };
type MutableStringArray = CRDTUnknownArray<string>;
interface CRDTInlineText extends CRDTText {
	insertEmbed(offset: number, value: Record<string, unknown>): void;
}
interface CRDTText {
	insert(offset: number, text: string, attributes?: Record<string, unknown | null>): void;
	delete(offset: number, length: number): void;
	format(offset: number, length: number, attributes: Record<string, unknown>): void;
	toDelta(): Array<{ insert: string | object; attributes?: Record<string, unknown> }>;
	toString(): string;
	readonly length: number;
}

// sentinel-storage: empty-block caret target in Y.Text. Not a logical character.

function embedRecordFromInlineOp(op: InsertInlineNodeOp): Record<string, unknown> {
	const embed = Object.create(null) as Record<string, unknown>;
	if (op.props) {
		for (const key of Object.keys(op.props)) {
			embed[key] = op.props[key];
		}
	}
	embed.type = op.nodeType;
	return embed;
}


export function insertText(pipeline: ApplyPipeline, op: InsertTextOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const blockMap = self._getMutableBlockMap(op.blockId);
if (!blockMap) return [];
const content = self._getTextContent(blockMap);
if (!content) return [];

// sentinel-storage: drop the empty-block caret target before a real insert
if (content.length === 1 && content.toString() === EMPTY_BLOCK_SENTINEL) {
	content.delete(0, 1);
}

const marks = op.marks ? self._resolveMarks(op.marks) : undefined;
content.insert(op.offset, op.text, marks);
return [op.blockId];
}

export function deleteText(pipeline: ApplyPipeline, op: DeleteTextOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const blockMap = self._getMutableBlockMap(op.blockId);
if (!blockMap) return [];
const content = self._getTextContent(blockMap);
if (!content) return [];

content.delete(op.offset, op.length);
return [op.blockId];
}

export function formatText(pipeline: ApplyPipeline, op: FormatTextOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const blockMap = self._getMutableBlockMap(op.blockId);
if (!blockMap) return [];
const content = self._getTextContent(blockMap);
if (!content) return [];

content.format(op.offset, op.length, op.marks);
return [op.blockId];
}

export function replaceText(pipeline: ApplyPipeline, op: ReplaceTextOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const blockMap = self._getMutableBlockMap(op.blockId);
if (!blockMap) return [];
const content = self._getTextContent(blockMap);
if (!content) return [];

// sentinel-storage: drop the empty-block caret target before a real replace
if (content.length === 1 && content.toString() === EMPTY_BLOCK_SENTINEL) {
	content.delete(0, 1);
}

content.delete(op.offset, op.length);
const marks = op.marks ? self._resolveMarks(op.marks) : undefined;
content.insert(op.offset, op.text, marks);
return [op.blockId];
}

export function resolveMarks(pipeline: ApplyPipeline, 
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

export function insertInlineNode(pipeline: ApplyPipeline, op: InsertInlineNodeOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const rejectedKeys = rejectedOwnPropKeys(op.props);
if (rejectedKeys.length > 0) {
	self._emitter.emit("diagnostic", {
		code: "PEN_APPLY_009",
		level: "warn",
		source: "apply",
		message: `apply: rejected prototype keys in insert-inline-node props (${rejectedKeys.join(", ")})`,
		remediation:
			"Remove __proto__, constructor, and prototype own keys from op props.",
		op,
	});
	return [];
}

const blockMap = self._getMutableBlockMap(op.blockId);
if (!blockMap) return [];
const content = self._getInlineTextContent(blockMap);
if (!content) return [];

content.insertEmbed(op.offset, embedRecordFromInlineOp(op));
return [op.blockId];
}

export function removeInlineNode(pipeline: ApplyPipeline, op: RemoveInlineNodeOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const blockMap = self._getMutableBlockMap(op.blockId);
if (!blockMap) return [];
const content = self._getTextContent(blockMap);
if (!content) return [];

content.delete(op.offset, 1);
return [op.blockId];
}

export function setSelectionOp(pipeline: ApplyPipeline, op: SetSelectionOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
self._selection.setSelection(op.selection);
return [];
}

export function updateLayout(pipeline: ApplyPipeline, op: UpdateLayoutOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const blockMap = self._getMutableBlockMap(op.blockId);
if (!blockMap) return [];

const layoutMap = self._getOrCreateMapProp(blockMap, "layout");

for (const [key, value] of Object.entries(op.layout)) {
	if (value === undefined || value === null) {
		layoutMap.delete(key);
	} else {
		layoutMap.set(key, value);
	}
}

return [op.blockId];
}

export function createApp(pipeline: ApplyPipeline, op: CreateAppOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const appMap = self._createMutableMap();
appMap.set("type", op.appType);
appMap.set("placement", op.placement);

if (op.config && Object.keys(op.config).length > 0) {
	const configMap = self._createMutableMap();
	for (const [key, value] of Object.entries(op.config)) {
		configMap.set(key, value);
	}
	appMap.set("config", configMap);
}

self.mutableApps.set(op.appId, appMap);
return [];
}

export function updateApp(pipeline: ApplyPipeline, op: UpdateAppOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const appMap = self._getMutableAppMap(op.appId);
if (!appMap) return [];

const configMap = self._getOrCreateMapProp(appMap, "config");

for (const [key, value] of Object.entries(op.patch)) {
	if (value === undefined || value === null) {
		configMap.delete(key);
	} else {
		configMap.set(key, value);
	}
}
return [];
}

export function deleteApp(pipeline: ApplyPipeline, op: DeleteAppOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
self.mutableApps.delete(op.appId);
return [];
}

export function tableOp(pipeline: ApplyPipeline, op: DocumentOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const tableOp = op as { blockId: string; type: string };
const blockMap = self._getMutableBlockMap(tableOp.blockId);
if (!blockMap) return [];

return self._tableGrid.execute(blockMap, op);
}

export function clearTableState(_pipeline: ApplyPipeline, blockMap: MutableMap): void {
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
		(delta): delta is { insert: string; attributes?: Record<string, unknown> } =>
			// sentinel-storage: empty-block caret target is not preserved inline content
			typeof delta.insert === "string" && delta.insert !== EMPTY_BLOCK_SENTINEL,
	);
}

export function setMeta(pipeline: ApplyPipeline, op: SetMetaOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const blockMap = self._getMutableBlockMap(op.blockId);
if (!blockMap) return [];

const metaMap = self._getOrCreateMapProp(blockMap, "meta");

// Persist metadata as plain JSON so adapters can round-trip it predictably.
if (op.data === null) {
	metaMap.delete(op.namespace);
} else {
	metaMap.set(op.namespace, op.data);
}

return [op.blockId];
}
