import { resolveEditorMessage } from "@input/pen-core";
import type { MessageArgs, MessageKey } from "@input/pen-types";

import { useEditorContext } from "../context/editorContext";

export function useEditorMessage<K extends MessageKey>(
	key: K,
	...args: MessageArgs<K>
): string {
	const { editor } = useEditorContext();
	return resolveEditorMessage(editor, key, ...args);
}
