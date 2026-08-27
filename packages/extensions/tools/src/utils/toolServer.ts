import { toolRuntimeFacet } from "@input/pen-core";
import type { Editor, ToolRuntime } from "@input/pen-types";

export function getDocumentToolRuntime(editor: Editor): ToolRuntime | null {
	return (
		(editor.facet(toolRuntimeFacet) as ToolRuntime | null) ??
		null
	);
}
