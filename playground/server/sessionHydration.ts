import type { Editor } from "@pen/types";
import type {
	SerializedBlock,
	SerializedEditorState,
	SerializedSelection,
} from "./utils/sessionSyncValidation";
import { buildTableSnapshotOps } from "./utils/tableSnapshot";

export function hydrateEditor(
	editor: Editor,
	state: SerializedEditorState,
): Map<string, string> {
	const firstSerializedBlock = state.blocks[0];
	const firstEditorBlock = editor.firstBlock();
	const idMap = new Map<string, string>();

	if (firstSerializedBlock && firstEditorBlock) {
		idMap.set(firstSerializedBlock.id, firstEditorBlock.id);
		applyBlockSnapshot(
			editor,
			firstSerializedBlock,
			firstEditorBlock.id,
			idMap,
		);
	}

	for (const block of state.blocks.slice(1)) {
		insertBlockSnapshot(editor, block, idMap);
	}

	restoreSelection(editor, state.selection, idMap);
	return idMap;
}

function insertBlockSnapshot(
	editor: Editor,
	block: SerializedBlock,
	idMap: Map<string, string>,
): void {
	editor.apply([
		{
			type: "insert-block",
			blockId: block.id,
			blockType: block.type,
			props: block.props,
			position: "last",
		},
	]);

	idMap.set(block.id, block.id);
	applyBlockSnapshot(editor, block, block.id, idMap);
}

function applyBlockSnapshot(
	editor: Editor,
	block: SerializedBlock,
	targetBlockId: string,
	idMap: Map<string, string>,
): void {
	editor.apply([
		{
			type: "convert-block",
			blockId: targetBlockId,
			newType: block.type,
			newProps: normalizeBlockProps(block.props, idMap),
		},
	]);

	if (block.text) {
		editor.apply([
			{
				type: "insert-text",
				blockId: targetBlockId,
				offset: 0,
				text: block.text,
			},
		]);
	}

	applyTableSnapshot(editor, targetBlockId, block);

	const childBlocks = block.children ?? [];
	for (const child of childBlocks) {
		editor.apply([
			{
				type: "insert-block",
				blockId: child.id,
				blockType: child.type,
				props: {
					...normalizeBlockProps(child.props, idMap),
					parentId: targetBlockId,
				},
				position: "last",
			},
		]);

		idMap.set(child.id, child.id);
		applyBlockSnapshot(editor, child, child.id, idMap);
	}
}

function applyTableSnapshot(
	editor: Editor,
	blockId: string,
	block: SerializedBlock,
): void {
	if (!block.table) {
		return;
	}
	const currentBlock = editor.getBlock(blockId);
	const ops = buildTableSnapshotOps(blockId, block.table, {
		rowCount: currentBlock?.tableRowCount() ?? 0,
		columnCount: currentBlock?.tableColumnCount() ?? 0,
	});
	if (ops.length > 0) {
		editor.apply(ops);
	}
}

function restoreSelection(
	editor: Editor,
	selection: SerializedSelection,
	idMap: Map<string, string>,
): void {
	if (!selection) {
		return;
	}

	if (selection.type === "text") {
		const blockId = idMap.get(selection.blockId) ?? selection.blockId;
		editor.selectTextRange(
			{ blockId, offset: selection.anchor },
			{ blockId, offset: selection.focus },
		);
		return;
	}

	if (selection.type === "block") {
		editor.selectBlocks(
			selection.blockIds.map((blockId) => idMap.get(blockId) ?? blockId),
		);
		return;
	}

	if (selection.type === "cell") {
		const blockId = idMap.get(selection.blockId) ?? selection.blockId;
		editor.selectCellRange(blockId, selection.anchor, selection.head);
	}
}

function normalizeBlockProps(
	props: Record<string, unknown>,
	idMap: Map<string, string>,
): Record<string, unknown> {
	const normalizedParentId =
		typeof props.parentId === "string"
			? (idMap.get(props.parentId) ?? props.parentId)
			: props.parentId;

	return {
		...props,
		...(normalizedParentId ? { parentId: normalizedParentId } : {}),
	};
}
