import type { Editor, KeyBindingContext } from "@pen/types";
import {
	COLLECT_KEY_BINDINGS_SLOT_KEY,
	usesInlineTextSelection,
} from "@pen/types";
import { getEditorBlockSelectionLength } from "../utils/blockSelectionSemantics";

export function tryHandleHistoryOverrideBinding(
	editor: Editor,
	event: KeyboardEvent,
): boolean {
	if (!isUndoShortcut(event) && !isRedoShortcut(event)) {
		return false;
	}

	const bindings = collectKeyBindings(editor);
	for (const binding of bindings) {
		if (
			matchesBindingContext(editor, binding.context) &&
			matchesKey(binding.key, event) &&
			binding.handler(editor, event)
		) {
			return true;
		}
	}

	return false;
}

export function getDocumentTextRange(editor: Editor): {
	start: { blockId: string; offset: number };
	end: { blockId: string; offset: number };
	focusBlockId: string;
} | null {
	const blockOrder = editor.documentState.blockOrder;
	const firstBlockId = blockOrder[0];
	const lastBlockId = blockOrder[blockOrder.length - 1];
	if (!firstBlockId || !lastBlockId) {
		return null;
	}

	const focusBlockId =
		blockOrder.find((blockId) => {
			const block = editor.getBlock(blockId);
			if (!block) return false;
			const schema = editor.schema.resolve(block.type);
			return usesInlineTextSelection(schema);
		}) ?? firstBlockId;

	return {
		start: { blockId: firstBlockId, offset: 0 },
		end: {
			blockId: lastBlockId,
			offset: getEditorBlockSelectionLength(editor, lastBlockId),
		},
		focusBlockId,
	};
}

export function collectKeyBindings(editor: Editor): ReadonlyArray<{
	key: string;
	context?: KeyBindingContext;
	handler: (editor: Editor, event: KeyboardEvent) => boolean;
}> {
	const collect =
		editor.internals.getSlot<
			(registry: Editor["schema"]) => ReadonlyArray<{
				key: string;
				context?: KeyBindingContext;
				handler: (editor: Editor, event: KeyboardEvent) => boolean;
			}>
		>(COLLECT_KEY_BINDINGS_SLOT_KEY) ?? null;
	return collect?.(editor.schema) ?? [];
}

export function matchesBindingContext(
	editor: Editor,
	context: KeyBindingContext | undefined,
): boolean {
	if (!context) return true;

	const selection = editor.selection;
	const activeBlock = getActiveBlock(editor);

	if (
		context.blockType &&
		(!activeBlock || !context.blockType.includes(activeBlock.type))
	) {
		return false;
	}

	if (context.hasSelection !== undefined) {
		const hasSelection =
			selection?.type === "text"
				? !selection.isCollapsed
				: selection !== null;
		if (hasSelection !== context.hasSelection) {
			return false;
		}
	}

	if (context.collapsed !== undefined) {
		const isCollapsed = selection?.type === "text" && selection.isCollapsed;
		if (isCollapsed !== context.collapsed) {
			return false;
		}
	}

	if (
		context.withinLayout &&
		(!activeBlock || !isWithinLayout(activeBlock, context.withinLayout))
	) {
		return false;
	}

	return true;
}

function getActiveBlock(editor: Editor) {
	const selection = editor.selection;
	if (!selection) return null;

	if (selection.type === "text") {
		return editor.getBlock(selection.anchor.blockId);
	}

	if (selection.type === "block") {
		const blockId = selection.blockIds[0];
		return blockId ? editor.getBlock(blockId) : null;
	}

	if (selection.type === "cell") {
		return editor.getBlock(selection.blockId);
	}

	return null;
}

function isWithinLayout(
	block: NonNullable<ReturnType<typeof getActiveBlock>>,
	allowedLayoutTypes: readonly string[],
): boolean {
	let parent = block.layoutParent();
	while (parent) {
		if (allowedLayoutTypes.includes(parent.type)) {
			return true;
		}
		parent = parent.layoutParent();
	}

	return false;
}

export function matchesKey(pattern: string, event: KeyboardEvent): boolean {
	const parts = pattern.split("-").map((part) => part.toLowerCase());
	const key = parts.pop()?.toLowerCase() ?? "";

	const needsCtrl = parts.includes("ctrl");
	const needsMeta = parts.includes("meta");
	const needsMod = parts.includes("mod");
	const needsShift = parts.includes("shift");
	const needsAlt = parts.includes("alt");

	const isMac =
		typeof navigator !== "undefined" &&
		/Mac|iPhone|iPad/.test(navigator.platform ?? "");

	const allowCtrl = needsCtrl || (needsMod && !isMac);
	const allowMeta = needsMeta || (needsMod && isMac);

	const modMatch = needsMod ? (isMac ? event.metaKey : event.ctrlKey) : true;
	const ctrlMatch = allowCtrl ? event.ctrlKey : !event.ctrlKey;
	const metaMatch = allowMeta ? event.metaKey : !event.metaKey;
	const shiftMatch = needsShift ? event.shiftKey : !event.shiftKey;
	const altMatch = needsAlt ? event.altKey : !event.altKey;

	return (
		modMatch &&
		ctrlMatch &&
		metaMatch &&
		shiftMatch &&
		altMatch &&
		event.key.toLowerCase() === key
	);
}

export function isSelectAllShortcut(event: KeyboardEvent): boolean {
	return (
		event.key.toLowerCase() === "a" &&
		!event.shiftKey &&
		!event.altKey &&
		(event.metaKey || event.ctrlKey)
	);
}

export function isUndoShortcut(event: KeyboardEvent): boolean {
	return (
		event.key.toLowerCase() === "z" &&
		!event.shiftKey &&
		!event.altKey &&
		(event.metaKey || event.ctrlKey)
	);
}

export function isRedoShortcut(event: KeyboardEvent): boolean {
	const key = event.key.toLowerCase();
	const usesMod = event.metaKey || event.ctrlKey;
	return (
		usesMod &&
		!event.altKey &&
		((key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey))
	);
}
