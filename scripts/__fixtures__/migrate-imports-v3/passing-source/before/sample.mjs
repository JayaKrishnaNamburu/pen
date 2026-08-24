import { exportEditorToJson } from "@input/pen-export-json";

export function dump(editor) {
	return exportEditorToJson(editor);
}
