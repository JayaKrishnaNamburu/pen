import { createContext, useContext } from "react";

export interface EditorContentContextValue {
	emptyPlaceholder?: string;
	isEmpty: boolean;
}

const EMPTY_EDITOR_CONTENT_CONTEXT: EditorContentContextValue = {
	emptyPlaceholder: undefined,
	isEmpty: false,
};

export const EditorContentContext =
	createContext<EditorContentContextValue | null>(null);

export function useEditorContentContext(): EditorContentContextValue {
	return useContext(EditorContentContext) ?? EMPTY_EDITOR_CONTENT_CONTEXT;
}
