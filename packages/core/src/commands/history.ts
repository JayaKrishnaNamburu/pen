import type {
	CommandResult,
	Editor,
	FacetProvider,
	UndoManager,
} from "@input/pen-types";

import { undoManagerFacet } from "../facets/controllerFacets";
import { commandHandler, defineCommand } from "./define";

export const historyUndo = defineCommand("history.undo");
export const historyRedo = defineCommand("history.redo");

export function historyCommandHandlers(): FacetProvider[] {
	return [
		commandHandler(historyUndo, (editor) => handleHistory(editor, "undo")),
		commandHandler(historyRedo, (editor) => handleHistory(editor, "redo")),
	];
}

function handleHistory(
	editor: Editor,
	direction: "undo" | "redo",
): CommandResult | false {
	const manager = resolveUndoManager(editor);
	if (!manager) {
		return false;
	}

	const can = direction === "undo" ? manager.canUndo() : manager.canRedo();
	if (!can) {
		return false;
	}

	const ran = direction === "undo" ? manager.undo() : manager.redo();
	return ran;
}

function resolveUndoManager(editor: Editor): UndoManager | null {
	try {
		const fromFacet = editor.facet(undoManagerFacet);
		if (isUndoManager(fromFacet)) {
			return fromFacet;
		}
	} catch {
		// facet not installed; fall through to editor.undoManager
	}
	return isUndoManager(editor.undoManager) ? editor.undoManager : null;
}

function isUndoManager(value: unknown): value is UndoManager {
	if (!value || typeof value !== "object") {
		return false;
	}
	const manager = value as Partial<UndoManager>;
	return (
		typeof manager.undo === "function" &&
		typeof manager.redo === "function" &&
		typeof manager.canUndo === "function" &&
		typeof manager.canRedo === "function"
	);
}
