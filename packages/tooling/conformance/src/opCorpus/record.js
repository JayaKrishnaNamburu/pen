/**
 * Records the update-equality corpus from the live v2
 * implementation. Run once; the committed JSON is the oracle. The test
 * never calls this.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	convertBlock,
	deleteBackward,
	deleteBlock,
	duplicateBlock,
	indent,
	insertText,
	moveBlockDown,
	splitBlock,
	toggleMark,
} from "@input/pen-core";

import { readLiveDocumentOpTypes } from "./liveUnion.js";
import {
	applySetup,
	captureApply,
	createCorpusSession,
	destroyCorpusSession,
	dispatchCommand,
	snapshotSession,
} from "./session.js";
import { encodeUpdateBytes, snapshotSelection } from "./snapshot.js";

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, "../../corpus/op-equality");
const opsTsPath = join(here, "../../../../types/src/types/ops.ts");

const TABLE_3X3_SETUP = {
	blocks: [{ id: "tbl", type: "table", props: { hasHeaderRow: true } }],
	extraOps: [
		{ type: "grid", blockId: "tbl", change: { kind: "insert-row", index: 2  }},
		{ type: "grid", blockId: "tbl", change: { kind: "insert-column", index: 2  }},
		{
			type: "splice-text",
			blockId: "tbl",
			row: 0,
			col: 0,
			offset: 0,
			text: "r0c0",
		},
		{
			type: "splice-text",
			blockId: "tbl",
			row: 0,
			col: 1,
			offset: 0,
			text: "r0c1",
		},
		{
			type: "splice-text",
			blockId: "tbl",
			row: 1,
			col: 0,
			offset: 0,
			text: "r1c0",
		},
		{
			type: "splice-text",
			blockId: "tbl",
			row: 2,
			col: 2,
			offset: 0,
			text: "r2c2",
		},
	],
};

const NESTED_TOGGLE_SETUP = {
	blocks: [
		{
			id: "toggle",
			type: "toggle",
			text: "Parent",
			props: { open: true },
		},
		{
			id: "child",
			type: "paragraph",
			text: "Nested child",
			parent: "toggle",
			index: 0,
		},
	],
};

function recordOne(def) {
	const session = createCorpusSession();
	try {
		applySetup(session, def.setup);
		const initialSnapshot = snapshotSession(session);
		let captured;
		if (def.path === "command") {
			captured = captureApply(session, () => {
				dispatchCommand(session, def.command, def.param);
			});
		} else if (def.path === "stream-open") {
			const presented = [];
			const unsub = session.editor.onBeforeApply((ops) => {
				for (const op of ops) {
					if (op.type === "stream-open") {
						presented.push(op);
					}
				}
				return ops;
			});
			captured = captureApply(session, () => {
				const writer = session.editor.openTextStream(
					{ blockId: def.streamBlockId },
					{ origin: "ai" },
				);
				writer.close();
			});
			unsub();
			if (presented.length === 0) {
				throw new Error("stream-open was not presented to beforeApply");
			}
			captured = { ...captured, ops: presented };
		} else if (def.path === "stream-replace") {
			captured = captureApply(session, () => {
				const writer = session.editor.openTextStream(
					{ blockId: def.streamBlockId },
					{ origin: "ai", flushIntervalMs: 16 },
				);
				writer.splice(def.splice.from, def.splice.to, def.splice.text);
				writer.flush();
				writer.close();
			});
		} else {
			captured = captureApply(session, () => {
				session.editor.apply(def.ops, { origin: "user" });
			});
		}
		const types = captured.ops.map((op) => op.type);
		if (!types.includes(def.opType)) {
			throw new Error(
				`${def.id}: expected op ${def.opType}, got [${types.join(", ")}]`,
			);
		}
		return {
			id: def.id,
			opType: def.opType,
			family: def.family,
			path: def.recordPath,
			command: def.commandName ?? null,
			setup: def.setup,
			ops: captured.ops,
			updateBytes: encodeUpdateBytes(captured.update),
			updateByteLength: captured.update.byteLength,
			initialSnapshot,
			snapshot: snapshotSession(session),
			selectionAfter: snapshotSelection(session.editor),
		};
	} finally {
		destroyCorpusSession(session);
	}
}

const FIXTURES = [
	{
		id: "insert-text",
		opType: "insert-text",
		family: "typing",
		path: "command",
		recordPath: "command",
		command: insertText,
		commandName: "pen.insertText",
		param: { text: "!" },
		setup: {
			blocks: [{ id: "p1", type: "paragraph", text: "Hello" }],
			selection: { blockId: "p1", from: 5, to: 5 },
		},
	},
	{
		id: "delete-text",
		opType: "delete-text",
		family: "typing",
		path: "command",
		recordPath: "command",
		command: deleteBackward,
		commandName: "pen.deleteBackward",
		param: { granularity: "grapheme" },
		setup: {
			blocks: [{ id: "p1", type: "paragraph", text: "Hello" }],
			selection: { blockId: "p1", from: 5, to: 5 },
		},
	},
	{
		id: "format-text",
		opType: "format-text",
		family: "marks",
		path: "command",
		recordPath: "command",
		command: toggleMark,
		commandName: "pen.toggleMark",
		param: { mark: "bold" },
		setup: {
			blocks: [{ id: "p1", type: "paragraph", text: "Hello" }],
			selection: { blockId: "p1", from: 0, to: 5 },
		},
	},
	{
		id: "replace-text",
		opType: "replace-text",
		family: "typing",
		path: "stream-replace",
		recordPath: "command",
		commandName: "editor.openTextStream.splice",
		streamBlockId: "p1",
		splice: { from: 0, to: 5, text: "Hi" },
		setup: {
			blocks: [{ id: "p1", type: "paragraph", text: "Hello" }],
		},
	},
	{
		id: "insert-inline-node",
		opType: "insert-inline-node",
		family: "atoms",
		path: "command",
		recordPath: "command",
		command: duplicateBlock,
		commandName: "pen.duplicateBlock",
		param: { blockId: "p1" },
		setup: {
			blocks: [
				{
					id: "p1",
					type: "paragraph",
					text: "Hi ",
					mention: {
						offset: 3,
						props: { id: "ada", label: "Ada" },
					},
				},
			],
		},
	},
	{
		id: "remove-inline-node",
		opType: "remove-inline-node",
		family: "atoms",
		path: "apply",
		recordPath: "synthetic",
		ops: [{ type: "remove-inline-node", blockId: "p1", offset: 3 }],
		setup: {
			blocks: [
				{
					id: "p1",
					type: "paragraph",
					text: "Hi ",
					mention: {
						offset: 3,
						props: { id: "ada", label: "Ada" },
					},
				},
			],
		},
	},
	{
		id: "insert-block",
		opType: "insert-block",
		family: "conversions",
		path: "command",
		recordPath: "command",
		command: duplicateBlock,
		commandName: "pen.duplicateBlock",
		param: { blockId: "p1" },
		setup: {
			blocks: [{ id: "p1", type: "paragraph", text: "Hello" }],
		},
	},
	{
		id: "update-block",
		opType: "update-block",
		family: "conversions",
		path: "command",
		recordPath: "command",
		command: indent,
		commandName: "pen.indent",
		param: undefined,
		setup: {
			blocks: [
				{
					id: "li1",
					type: "bulletListItem",
					text: "one",
					props: { indent: 0 },
				},
				{
					id: "li2",
					type: "bulletListItem",
					text: "two",
					props: { indent: 0 },
				},
			],
			selection: { blockId: "li2", from: 0, to: 0 },
		},
	},
	{
		id: "delete-block",
		opType: "delete-block",
		family: "conversions",
		path: "command",
		recordPath: "command",
		command: deleteBlock,
		commandName: "pen.deleteBlock",
		param: { blockId: "p2" },
		setup: {
			blocks: [
				{ id: "p1", type: "paragraph", text: "keep" },
				{ id: "p2", type: "paragraph", text: "gone" },
			],
		},
	},
	{
		id: "move-block",
		opType: "move-block",
		family: "layout",
		path: "command",
		recordPath: "command",
		command: moveBlockDown,
		commandName: "pen.moveBlockDown",
		param: { blockId: "p1" },
		setup: {
			blocks: [
				{ id: "p1", type: "paragraph", text: "first" },
				{ id: "p2", type: "paragraph", text: "second" },
			],
		},
	},
	{
		id: "convert-block",
		opType: "convert-block",
		family: "conversions",
		path: "command",
		recordPath: "command",
		command: convertBlock,
		commandName: "pen.convertBlock",
		param: { blockId: "p1", newType: "heading", newProps: { level: 2 } },
		setup: {
			blocks: [{ id: "p1", type: "paragraph", text: "Title" }],
		},
	},
	{
		id: "split-block",
		opType: "split-block",
		family: "splits",
		path: "command",
		recordPath: "command",
		command: splitBlock,
		commandName: "pen.splitBlock",
		param: undefined,
		setup: {
			blocks: [{ id: "p1", type: "paragraph", text: "HelloWorld" }],
			selection: { blockId: "p1", from: 5, to: 5 },
		},
	},
	{
		id: "merge-blocks",
		opType: "merge-blocks",
		family: "merges",
		path: "command",
		recordPath: "command",
		command: deleteBackward,
		commandName: "pen.deleteBackward",
		param: { granularity: "grapheme" },
		setup: {
			blocks: [
				{ id: "p1", type: "paragraph", text: "Hello" },
				{ id: "p2", type: "paragraph", text: "World" },
			],
			selection: { blockId: "p2", from: 0, to: 0 },
		},
	},
	{
		id: "update-layout",
		opType: "update-layout",
		family: "layout",
		path: "apply",
		recordPath: "synthetic",
		ops: [
			{
				type: "set-props",
				blockId: "toggle",
				layout: { display: "flex", gap: 8, direction: "column" },
			},
		],
		setup: NESTED_TOGGLE_SETUP,
	},
	{
		id: "insert-table-row",
		opType: "insert-table-row",
		family: "tables",
		path: "command",
		recordPath: "command",
		command: duplicateBlock,
		commandName: "pen.duplicateBlock",
		param: { blockId: "tbl" },
		setup: {
			blocks: [{ id: "tbl", type: "table", props: { hasHeaderRow: true } }],
			extraOps: [
				{ type: "grid", blockId: "tbl", change: { kind: "insert-row", index: 2  }},
				{
					type: "splice-text",
					blockId: "tbl",
					row: 2,
					col: 0,
					offset: 0,
					text: "third-row",
				},
			],
		},
	},
	{
		id: "delete-table-row",
		opType: "delete-table-row",
		family: "tables",
		path: "apply",
		recordPath: "synthetic",
		ops: [{ type: "grid", blockId: "tbl", change: { kind: "delete-row", index: 1  }}],
		setup: TABLE_3X3_SETUP,
	},
	{
		id: "insert-table-column",
		opType: "insert-table-column",
		family: "tables",
		path: "command",
		recordPath: "command",
		command: duplicateBlock,
		commandName: "pen.duplicateBlock",
		param: { blockId: "tbl" },
		setup: {
			blocks: [{ id: "tbl", type: "table", props: { hasHeaderRow: true } }],
			extraOps: [
				{ type: "grid", blockId: "tbl", change: { kind: "insert-column", index: 2  }},
				{
					type: "splice-text",
					blockId: "tbl",
					row: 0,
					col: 2,
					offset: 0,
					text: "third-col",
				},
			],
		},
	},
	{
		id: "delete-table-column",
		opType: "delete-table-column",
		family: "tables",
		path: "apply",
		recordPath: "synthetic",
		ops: [{ type: "grid", blockId: "tbl", change: { kind: "delete-column", index: 1  }}],
		setup: TABLE_3X3_SETUP,
	},
	{
		id: "merge-table-cells",
		opType: "merge-table-cells",
		family: "tables",
		path: "apply",
		recordPath: "synthetic",
		ops: [
			{
				type: "merge-table-cells",
				blockId: "tbl",
				anchor: { row: 0, col: 0 },
				head: { row: 1, col: 1 },
			},
		],
		setup: TABLE_3X3_SETUP,
	},
	{
		id: "split-table-cell",
		opType: "split-table-cell",
		family: "tables",
		path: "apply",
		recordPath: "synthetic",
		ops: [{ type: "split-table-cell", blockId: "tbl", row: 0, col: 0 }],
		setup: TABLE_3X3_SETUP,
	},
	{
		id: "insert-table-cell-text",
		opType: "insert-table-cell-text",
		family: "cells",
		path: "command",
		recordPath: "command",
		command: duplicateBlock,
		commandName: "pen.duplicateBlock",
		param: { blockId: "tbl" },
		setup: {
			blocks: [{ id: "tbl", type: "table", props: { hasHeaderRow: true } }],
			extraOps: [
				{
					type: "splice-text",
					blockId: "tbl",
					row: 0,
					col: 0,
					offset: 0,
					text: "alpha",
				},
				{
					type: "splice-text",
					blockId: "tbl",
					row: 1,
					col: 1,
					offset: 0,
					text: "omega",
				},
			],
		},
	},
	{
		id: "delete-table-cell-text",
		opType: "delete-table-cell-text",
		family: "cells",
		path: "apply",
		recordPath: "synthetic",
		ops: [
			{
				type: "splice-text",
				blockId: "tbl",
				row: 0,
				col: 0,
				offset: 1,
				length: 3,
			},
		],
		setup: TABLE_3X3_SETUP,
	},
	{
		id: "format-table-cell-text",
		opType: "format-table-cell-text",
		family: "cells",
		path: "apply",
		recordPath: "synthetic",
		ops: [
			{
				type: "format-text",
				blockId: "tbl",
				row: 0,
				col: 0,
				offset: 0,
				length: 4,
				marks: { bold: true },
			},
		],
		setup: TABLE_3X3_SETUP,
	},
	{
		id: "update-table-columns",
		opType: "update-table-columns",
		family: "tables",
		path: "apply",
		recordPath: "synthetic",
		ops: [
			{
				type: "set-props",
				blockId: "tbl",
				columns: [
					{ id: "col-a", title: "A", type: "text", width: 120 },
					{ id: "col-b", title: "B", type: "number", width: 80 },
					{ id: "col-c", title: "C", type: "select", width: 100 },
				],
			},
		],
		setup: TABLE_3X3_SETUP,
	},
	{
		id: "set-meta",
		opType: "set-meta",
		family: "apps",
		path: "apply",
		recordPath: "synthetic",
		ops: [
			{
				type: "set-meta",
				blockId: "child",
				namespace: "comment",
				data: { threadId: "t1", count: 2 },
			},
		],
		setup: NESTED_TOGGLE_SETUP,
	},
	{
		id: "create-app",
		opType: "create-app",
		family: "apps",
		path: "apply",
		recordPath: "synthetic",
		ops: [
			{
				type: "create-app",
				appId: "app-1",
				appType: "calendar",
				config: { view: "week" },
				placement: {
					mode: "anchored",
					blockId: "child",
					anchor: "after",
				},
			},
		],
		setup: NESTED_TOGGLE_SETUP,
	},
	{
		id: "update-app",
		opType: "update-app",
		family: "apps",
		path: "apply",
		recordPath: "synthetic",
		ops: [
			{
				type: "update-app",
				appId: "app-1",
				patch: { view: "month", density: "compact" },
			},
		],
		setup: {
			...NESTED_TOGGLE_SETUP,
			extraOps: [
				{
					type: "create-app",
					appId: "app-1",
					appType: "calendar",
					config: { view: "week" },
					placement: {
						mode: "anchored",
						blockId: "child",
						anchor: "after",
					},
				},
			],
		},
	},
	{
		id: "delete-app",
		opType: "delete-app",
		family: "apps",
		path: "apply",
		recordPath: "synthetic",
		ops: [{ type: "delete-app", appId: "app-1" }],
		setup: {
			...NESTED_TOGGLE_SETUP,
			extraOps: [
				{
					type: "create-app",
					appId: "app-1",
					appType: "calendar",
					config: { view: "week" },
					placement: {
						mode: "anchored",
						blockId: "child",
						anchor: "after",
					},
				},
			],
		},
	},
	{
		id: "set-selection",
		opType: "set-selection",
		family: "typing",
		path: "apply",
		recordPath: "synthetic",
		ops: [
			{
				type: "set-selection",
				selection: {
					type: "text",
					anchor: { blockId: "p2", offset: 2 },
					focus: { blockId: "p2", offset: 5 },
				},
			},
		],
		setup: {
			blocks: [
				{ id: "p1", type: "paragraph", text: "AAAAA" },
				{ id: "p2", type: "paragraph", text: "BBBBB" },
			],
			selection: { blockId: "p1", from: 0, to: 0 },
		},
	},
	{
		id: "stream-open",
		opType: "stream-open",
		family: "streams",
		path: "stream-open",
		recordPath: "command",
		commandName: "editor.openTextStream",
		streamBlockId: "p1",
		setup: {
			blocks: [{ id: "p1", type: "paragraph", text: "stream" }],
		},
	},
];

function writeJson(path, value) {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`);
}

function main() {
	mkdirSync(corpusDir, { recursive: true });
	const opsSource = readFileSync(opsTsPath, "utf8");
	const live = readLiveDocumentOpTypes(opsSource);
	if (live.length !== 30) {
		throw new Error(
			`live DocumentOp count is ${live.length}, not 30 — stop`,
		);
	}

	const coverage = {};
	for (const def of FIXTURES) {
		const fixture = recordOne(def);
		writeJson(join(corpusDir, `${def.id}.json`), fixture);
		coverage[def.opType] = {
			fixture: `${def.id}.json`,
			path: fixture.path,
			command: fixture.command,
			family: fixture.family,
			opsInBatch: fixture.ops.map((op) => op.type),
			updateByteLength: fixture.updateByteLength,
		};
		console.log(
			`recorded ${def.id} path=${fixture.path} ops=[${fixture.ops.map((op) => op.type).join(",")}] bytes=${fixture.updateByteLength}`,
		);
	}

	const missing = live
		.map((entry) => entry.type)
		.filter((type) => coverage[type] == null);
	if (missing.length > 0) {
		throw new Error(`missing fixtures: ${missing.join(", ")}`);
	}

	writeJson(join(corpusDir, "manifest.json"), {
		schemaVersion: 1,
		recordedAt: "2026-08-23",
		documentOpMemberCount: live.length,
		tightPattern: "^\\s*\\| [A-Z][A-Za-z]+Op",
		determinism: {
			yjsClientId: 1,
			yjsGuid: "pen-op-equality-v2",
			uuidSeed:
				"incrementing v4-shaped crypto.randomUUID; reset to 1 at session start; APPLY_ID_BASE=10000 at first captured apply",
			compared: [
				"canonical JSON document snapshot (blockOrder/blocks/apps/metadata)",
				"Y.encodeStateAsUpdate(ydoc, stateVectorBeforeApply) base64",
			],
		},
		coverage,
	});
	console.log(`wrote ${FIXTURES.length} fixtures + manifest to ${corpusDir}`);
}

main();
