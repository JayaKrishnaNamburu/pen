import { exportEditorToJson } from "@input/pen-interop/json";

export function dump(editor) {
	return exportEditorToJson(editor);
}
