import type {
	Editor,
	PenStreamPart,
	ToolContext,
} from "@input/pen-types";
import { ToolContextImpl } from "@input/pen-document-ops";

export function buildToolContext(
	editor: Editor,
	_zoneId: string,
	_blockId: string,
	_streamingTarget: unknown,
	onEmit?: (part: PenStreamPart) => void,
): ToolContext {
	return new ToolContextImpl(editor, "default", (part) => {
		onEmit?.(part);
	});
}
