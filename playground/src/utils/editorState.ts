import type { Editor } from "@pen/core";
import { getAttachedFieldEditorStore } from "@pen/react";

export function serializeEditorState(editor: Editor) {
	const blockIds = editor.documentState.blockOrder;
	const selection = editor.selection;
	const fieldEditor = getAttachedFieldEditorStore(editor);
	const fieldEditorState = fieldEditor?.getSnapshot() ?? null;

	return {
		blockCount: blockIds.length,
		selection: selection ? serializeSelection(selection) : null,
		fieldEditor: fieldEditorState
			? {
				focusBlockId: fieldEditorState.focusBlockId,
				activeBlockIds: fieldEditorState.activeBlockIds,
				isEditing: fieldEditorState.isEditing,
				isFocused: fieldEditorState.isFocused,
				inputMode: fieldEditorState.inputMode,
			}
			: null,
		blocks: blockIds.map((id) => {
			const block = editor.getBlock(id);

			if (!block) {
				return { id, type: "?" };
			}

			return {
				id: block.id,
				type: block.type,
				props: block.props,
				text: block.textContent(),
			};
		}),
	};
}

function serializeSelection(selection: Editor["selection"]) {
	if (!selection) {
		return null;
	}

	if (selection.type === "text") {
		return {
			type: selection.type,
			blockId: selection.anchor.blockId,
			anchor: selection.anchor.offset,
			focus: selection.focus.offset,
			collapsed: selection.isCollapsed,
			isMultiBlock: selection.isMultiBlock,
		};
	}

	if (selection.type === "block") {
		return {
			type: selection.type,
			blockIds: selection.blockIds,
		};
	}

	if (selection.type === "cell") {
		return {
			type: selection.type,
			blockId: selection.blockId,
			anchor: selection.anchor,
			head: selection.head,
		};
	}

	return {
		type: selection.type,
		appId: selection.appId,
	};
}
