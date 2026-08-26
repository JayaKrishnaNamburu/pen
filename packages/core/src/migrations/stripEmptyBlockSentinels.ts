import { recordDocumentLoadMigration, refreshFormatStamp } from "@input/pen-crdt-yjs";
import type { DocumentOp, Editor } from "@input/pen-types";

import {
	getCellText,
	getRowCells,
	getTableContent,
	getTextProp,
	isCRDTMap,
	type CRDTUnknownMap,
} from "../editor/crdtShapes";
import { isLoneEmptyBlockZwsp } from "../schema/emptyBlockSentinel";
import type { DocumentMigration } from "./types";

const STRIP_EMPTY_BLOCK_ZWSP_ID = "strip-empty-block-sentinels";

export function createStripEmptyBlockZwspMigration(): DocumentMigration {
	return {
		id: STRIP_EMPTY_BLOCK_ZWSP_ID,
		run(editor) {
			const ops = collectLoneSentinelStripOps(editor);
			if (ops.length > 0) {
				editor.apply(ops);
			}
			refreshFormatStamp(editor.internals.crdtDoc);
			recordDocumentLoadMigration(editor.internals.crdtDoc, {
				strippedSentinelCount: ops.length,
			});
			if (ops.length > 0) {
				editor.internals.emit("diagnostic", {
					code: "empty-block-sentinels-stripped",
					level: "info",
					source: "schema",
					message: `Stripped ${ops.length} lone empty-block sentinel(s).`,
					remediation:
						"Stamp-2 empty blocks stored a caret sentinel. Wave 5 stores the empty string.",
				});
			}
		},
	};
}

function collectLoneSentinelStripOps(editor: Editor): DocumentOp[] {
	const ops: DocumentOp[] = [];
	const blocks = editor.internals.doc.blocks;
	for (const handle of editor.blocks()) {
		const blockMap = blocks.get(handle.id);
		if (!isCRDTMap(blockMap)) {
			continue;
		}
		const content = getTextProp(blockMap, "content");
		if (content && isLoneEmptyBlockZwsp(content.toString())) {
			ops.push({
				type: "splice-text",
				blockId: handle.id,
				from: 0,
				to: content.length,
				insert: "",
			});
		}
		appendCellStripOps(handle.id, blockMap, ops);
	}
	return ops;
}

function appendCellStripOps(
	blockId: string,
	blockMap: CRDTUnknownMap,
	ops: DocumentOp[],
): void {
	const table = getTableContent(blockMap);
	if (!table) {
		return;
	}
	for (let row = 0; row < table.length; row++) {
		const rowMap = table.get(row);
		if (!isCRDTMap(rowMap)) {
			continue;
		}
		const cells = getRowCells(rowMap);
		if (!cells) {
			continue;
		}
		for (let col = 0; col < cells.length; col++) {
			const content = getCellText(rowMap, col);
			if (content && isLoneEmptyBlockZwsp(content.toString())) {
				ops.push({
					type: "splice-text",
					blockId,
					cell: { row, col },
					from: 0,
					to: content.length,
					insert: "",
				});
			}
		}
	}
}
