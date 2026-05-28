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
	UpdateTableColumnsOp,
	CRDTArray,
} from "@pen/types";
import { generateId, getOpOriginType } from "@pen/types";
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
const ZERO_WIDTH_SPACE = "\u200B";


export function insertBlock(pipeline: ApplyPipeline, op: InsertBlockOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const schema = self._registry.resolve(op.blockType);
if (!schema) return [];

const contentType = resolveRuntimeContentType(schema);
const blockMap = self._adapter.initBlockMap(
	self._crdtDoc,
	op.blockId,
	op.blockType,
	contentType,
) as MutableMap;

if (op.props && Object.keys(op.props).length > 0) {
	const propsMap = self._getOrCreateMapProp(blockMap, "props");
	for (const [key, value] of Object.entries(op.props)) {
		propsMap.set(key, value);
	}
}

if ((schema as { content: unknown }).content === "subdocument") {
	const propsMap = self._getOrCreateMapProp(blockMap, "props");
	const subdocument = blockMap.get("subdocument") as
		| { guid?: unknown }
		| undefined;
	if (
		subdocument &&
		typeof subdocument === "object" &&
		typeof subdocument.guid === "string"
	) {
		propsMap.set("subdocumentGuid", subdocument.guid);
	}
}

if (typeof op.position === "object" && "parent" in op.position) {
	const parentMap = self._getMutableBlockMap(op.position.parent);
	if (parentMap) {
		const children = self._getOrCreateStringArrayProp(
			parentMap,
			"children",
		);
		const idx = Math.min(op.position.index, children.length);
		children.insert(idx, [op.blockId]);
	}
} else {
	const idx = self._resolvePosition(op.position);
	self.mutableBlockOrder.insert(idx, [op.blockId]);
}

if ((schema as { content: unknown }).content === "database") {
	self._databaseOps.seedDatabaseBlock(blockMap);
}

return [op.blockId];
}

export function updateBlock(pipeline: ApplyPipeline, op: UpdateBlockOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const blockMap = self._getMutableBlockMap(op.blockId);
if (!blockMap) return [];

const propsMap = self._getOrCreateMapProp(blockMap, "props");

for (const [key, value] of Object.entries(op.props)) {
	if (value === undefined || value === null) {
		propsMap.delete(key);
	} else {
		propsMap.set(key, value);
	}
}

return [op.blockId];
}

export function deleteBlock(pipeline: ApplyPipeline, op: DeleteBlockOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
self.mutableBlocks.delete(op.blockId);
self._removeBlockIdFromArray(self.mutableBlockOrder, op.blockId);
self._removeBlockIdFromAllChildren(op.blockId);

return [op.blockId];
}

export function moveBlock(pipeline: ApplyPipeline, op: MoveBlockOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
self._removeBlockIdFromArray(self.mutableBlockOrder, op.blockId, true);
self._removeBlockIdFromAllChildren(op.blockId);

// Insert at new position
if (typeof op.position === "object" && "parent" in op.position) {
	const parentMap = self._getMutableBlockMap(op.position.parent);
	if (parentMap) {
		const children = self._getOrCreateStringArrayProp(
			parentMap,
			"children",
		);
		const idx = Math.min(op.position.index, children.length);
		children.insert(idx, [op.blockId]);
	}
} else {
	const idx = self._resolvePosition(op.position);
	self.mutableBlockOrder.insert(idx, [op.blockId]);
}

return [op.blockId];
}

export function convertBlock(pipeline: ApplyPipeline, op: ConvertBlockOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const blockMap = self._getMutableBlockMap(op.blockId);
if (!blockMap) return [];

const oldType = blockMap.get("type") as string;
const oldSchema = self._registry.resolve(oldType);
const newSchema = self._registry.resolve(op.newType);
if (!newSchema) return [];

blockMap.set("type", op.newType);

const propsMap = getMapProp(blockMap, "props");
if (propsMap) {
	const mutablePropsMap = propsMap as MutableMap;
	const newPropKeys = new Set(
		Object.keys(newSchema.propSchema ?? {}),
	);
	for (const key of [...(mutablePropsMap.keys?.() ?? [])]) {
		if (!newPropKeys.has(key)) {
			mutablePropsMap.delete(key);
		}
	}
}

if (op.newProps) {
	const props = self._getOrCreateMapProp(blockMap, "props");
	for (const [key, value] of Object.entries(op.newProps)) {
		props.set(key, value);
	}
}

const oldContent = oldSchema?.content;
const newContent = newSchema.content;
const preservedInlineDeltas =
	oldContent === "inline"
		? self._getPreservedInlineDeltas(self._getTextContent(blockMap))
		: [];

if (oldContent === "inline" && newContent !== "inline") {
	if (
		newContent === "none" ||
		newContent === "table" ||
		Array.isArray(newContent)
	) {
		blockMap.delete("content");
	}
} else if (oldContent !== "inline" && newContent === "inline") {
	const ytext = self._adapter.createText();
	blockMap.set("content", ytext);
}

const targetContent = resolveRuntimeContentType(newSchema);
if (targetContent !== "database") {
	self._clearDatabaseState(blockMap);
}
if (targetContent === "table") {
	blockMap.delete("tableColumns");
} else if (targetContent !== "database") {
	self._clearTableState(blockMap);
}

if (targetContent === "table" && !getTableContent(blockMap)) {
	self._tableGrid.seedTableBlock(blockMap, {
		rowCount: 2,
		colCount: 2,
		preservedInlineDeltas,
	});
}

if (targetContent === "database") {
	if (oldType === "table") {
		self._migrateTableToDatabase(blockMap, propsMap);
	}
	self._databaseOps.seedDatabaseBlock(blockMap);
}

return [op.blockId];
}

export function migrateTableToDatabase(pipeline: ApplyPipeline, 
	blockMap: MutableMap,
	propsMap: CRDTUnknownMap | null,
): void {
	const self = pipeline as ApplyPipelineRuntime;
const tableContent = getTableContent(blockMap);
if (!tableContent) {
	return;
}

const hasHeaderRow = propsMap?.get("hasHeaderRow") !== false;
const existingColumns = getTableColumns(blockMap);
if (!existingColumns || existingColumns.length === 0) {
	const columnCount =
		self._tableGrid.resolveGridColumnCount(blockMap);
	const columns = Array.from({ length: columnCount }, (_, index) => {
		const title =
			hasHeaderRow && tableContent.length > 0
				? self._tableGrid
						.readTableCellText(
							tableContent.get(0) as CRDTUnknownMap,
							index,
						)
						.trim() || `Column ${index + 1}`
				: `Column ${index + 1}`;
		return {
			id: `column-${index + 1}`,
			title,
			type: "text" as const,
		};
	});
	if (columns.length > 0) {
		self._tableGrid.setStructuredTableColumns(blockMap, columns);
	}
}

if (hasHeaderRow && tableContent.length > 0) {
	tableContent.delete(0, 1);
}

for (let rowIndex = 0; rowIndex < tableContent.length; rowIndex++) {
	const row = tableContent.get(rowIndex);
	if (!row || !isCRDTMap(row)) {
		continue;
	}
	if (!getStringProp(row, "id")) {
		row.set("id", generateId());
	}
}
}

export function splitBlock(pipeline: ApplyPipeline, op: SplitBlockOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const blockMap = self._getMutableBlockMap(op.blockId);
if (!blockMap) return [];

const content = self._getTextContent(blockMap);
if (!content) return [];

const oldType = blockMap.get("type") as string;
const newType = op.newBlockType ?? oldType;
const schema = self._registry.resolve(newType);

const deltas = content.toDelta();
const tailDeltas: Array<{
	insert: string | object;
	attributes?: Record<string, unknown>;
}> = [];
let pos = 0;

for (const delta of deltas) {
	const len =
		typeof delta.insert === "string" ? delta.insert.length : 1;
	if (pos + len <= op.offset) {
		pos += len;
		continue;
	}

	if (pos < op.offset) {
		const splitAt = op.offset - pos;
		const tailText = (delta.insert as string).slice(splitAt);
		if (tailText) {
			tailDeltas.push({
				insert: tailText,
				attributes: delta.attributes,
			});
		}
	} else {
		tailDeltas.push(delta);
	}
	pos += len;
}

const totalLength = content.length;
if (op.offset < totalLength) {
	content.delete(op.offset, totalLength - op.offset);
}

// Initialize the new block through the adapter so shared CRDT state stays consistent.
const contentType = resolveRuntimeContentType(schema);
const newBlockMap = self._adapter.initBlockMap(
	self._crdtDoc,
	op.newBlockId,
	newType,
	contentType,
) as MutableMap;

const newContent = self._getTextContent(newBlockMap);
if (newContent) {
	for (const delta of tailDeltas) {
		newContent.insert(
			newContent.length,
			delta.insert as string,
			delta.attributes,
		);
	}
}

// Copy parentId if present
const propsMap = getMapProp(blockMap, "props");
if (propsMap?.get?.("parentId")) {
	const newProps = getMapProp(newBlockMap, "props");
	if (newProps) {
		newProps.set("parentId", propsMap.get("parentId"));
	}
}

// Insert new block right after original in blockOrder
for (let i = 0; i < self.blockOrder.length; i++) {
	if (self.blockOrder.get(i) === op.blockId) {
		self.mutableBlockOrder.insert(i + 1, [op.newBlockId]);
		break;
	}
}

return [op.blockId, op.newBlockId];
}

export function mergeBlocks(pipeline: ApplyPipeline, op: MergeBlocksOp): string[] {
	const self = pipeline as ApplyPipelineRuntime;
const targetMap = self._getMutableBlockMap(op.targetBlockId);
const sourceMap = self._getMutableBlockMap(op.sourceBlockId);
if (!targetMap || !sourceMap) return [];

const targetContent = self._getTextContent(targetMap);
const sourceContent = self._getTextContent(sourceMap);

if (
	targetContent &&
	sourceContent &&
	typeof sourceContent.toDelta === "function"
) {
	if (
		targetContent.length === 1 &&
		targetContent.toString() === ZERO_WIDTH_SPACE
	) {
		targetContent.delete(0, 1);
	}

	const deltas = sourceContent.toDelta();
	for (const delta of deltas) {
		if (
			typeof delta.insert === "string" &&
			delta.insert === ZERO_WIDTH_SPACE
		) {
			continue;
		}
		targetContent.insert(
			targetContent.length,
			delta.insert as string,
			delta.attributes,
		);
	}

	while (targetContent.length > 1) {
		const placeholderOffset = targetContent
			.toString()
			.indexOf(ZERO_WIDTH_SPACE);
		if (placeholderOffset < 0) break;
		targetContent.delete(placeholderOffset, 1);
	}
}

self.mutableBlocks.delete(op.sourceBlockId);
for (let i = self.mutableBlockOrder.length - 1; i >= 0; i--) {
	if (self.blockOrder.get(i) === op.sourceBlockId) {
		self.mutableBlockOrder.delete(i, 1);
		break;
	}
}

return [op.targetBlockId, op.sourceBlockId];
}
