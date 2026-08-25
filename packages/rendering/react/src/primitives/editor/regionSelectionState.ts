import { createContext, useContext } from "react";
import type { RegionSelectionStore } from "@input/pen-dom";

export interface EditorRegionSelectionContextValue {
	rootElement: HTMLElement | null;
	setRootElement: (element: HTMLElement | null) => void;
	store: RegionSelectionStore;
}

export const EditorRegionSelectionContext =
	createContext<EditorRegionSelectionContextValue | null>(null);

export function useEditorRegionSelectionContext(): EditorRegionSelectionContextValue {
	const ctx = useContext(EditorRegionSelectionContext);
	if (!ctx) {
		throw new Error("Missing Pen.Editor.Root region selection context");
	}
	return ctx;
}
