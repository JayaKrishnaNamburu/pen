import { readFormatStamp } from "@input/pen-yjs";
import type { Editor } from "@input/pen-types";

import { runMigrations } from "./runMigrations";
import { createStripEmptyBlockZwspMigration } from "./stripEmptyBlockSentinels";

export function runPendingEmptyBlockMigrations(editor: Editor): void {
	const stamp = readFormatStamp(editor.internals.crdtDoc);
	if (stamp.format >= 3) {
		return;
	}
	runMigrations(editor, [createStripEmptyBlockZwspMigration()]);
}
