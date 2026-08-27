/**
 * Update-equality corpus.
 *
 * Today: replay each committed v2 fixture through the live apply path and
 * compare against the bytes/snapshot on disk. After the primitive rewrite
 * the same files are the oracle: a fresh replay must still converge.
 *
 * The expected bytes are committed artifacts. Computing them in this run
 * and comparing to themselves is the self-copy bug this package has had
 * twice. Do not "fix" a mismatch by rewriting the fixture from this run.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createHeadlessEditor } from "@input/pen-core";

// The ledger value is persisted into the document, so the string is the
// contract and a rename of core's constant must not move it. Asserting the
// literal is what makes that failure visible; importing the constant would
// silently follow a rename while stored documents kept the old value.
const STRIP_EMPTY_BLOCK_ZWSP_ID = "strip-empty-block-sentinels";
import {
	initBlockMap,
	readFormatStamp,
	yjsAdapter,
} from "@input/pen-yjs";
import { defaultSchema } from "@input/pen-schema";
import {
	MIGRATION_LEDGER_METADATA_KEY,
	PEN_FORMAT_METADATA_KEY,
} from "@input/pen-types";

import {
	applyReplayOps,
	applySetup,
	captureApply,
	createCorpusSession,
	createReplayContext,
	destroyCorpusSession,
	readLiveOpTypeSet,
	snapshotSession,
} from "./opCorpus/session.js";
import {
	assertCorpusSnapshot,
	assertCorpusUpdateBytes,
	encodeUpdateBytes,
} from "./opCorpus/snapshot.js";
import {
	isSetSelectionReplay,
	opsForReplay,
	translateRecordedOp,
} from "./opCorpus/translate.js";

const corpusDir = fileURLToPath(
	new URL("../corpus/op-equality/", import.meta.url),
);

/** Split/merge recipes insert before they delete; v2 compound executors deleted first. Same document, different Yjs item order. */
const SNAPSHOT_ONLY_OP_TYPES = new Set(["split-block", "merge-blocks"]);

function listFixtureFiles() {
	const names = readdirSync(corpusDir)
		.filter((name) => name.endsWith(".json") && name !== "manifest.json")
		.sort();
	return names.map((name) => join(corpusDir, name));
}

function readFixtureFile(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function replayFixtureFile(path) {
	const fixture = readFixtureFile(path);
	const session = createCorpusSession();
	try {
		applySetup(session, fixture.setup);
		const initial = snapshotSession(session);
		assertCorpusSnapshot(
			initial,
			fixture.initialSnapshot,
			`op-equality initial-snapshot mismatch: ${fixture.id}`,
		);
		const captured = captureApply(session, () => {
			applyReplayOps(session, fixture.ops);
		});
		const actualBytes = encodeUpdateBytes(captured.update);
		if (SNAPSHOT_ONLY_OP_TYPES.has(fixture.opType)) {
			assertCorpusSnapshot(
				snapshotSession(session),
				fixture.snapshot,
				`op-equality snapshot mismatch: ${fixture.id}`,
			);
			return fixture;
		}
		assertCorpusUpdateBytes(
			actualBytes,
			fixture.updateBytes,
			`op-equality update-bytes mismatch: ${fixture.id}`,
		);
		assertCorpusSnapshot(
			snapshotSession(session),
			fixture.snapshot,
			`op-equality snapshot mismatch: ${fixture.id}`,
		);
		return fixture;
	} finally {
		destroyCorpusSession(session);
	}
}

function readManifest() {
	return JSON.parse(readFileSync(join(corpusDir, "manifest.json"), "utf8"));
}

function checkCoverage() {
	const manifest = readManifest();
	const expectedTypes = Object.keys(manifest.coverage);
	const files = listFixtureFiles();
	console.log(
		`op-equality glob: ${files.length} files (pattern corpus/op-equality/*.json excluding manifest.json)`,
	);
	console.log(
		`op-equality frozen corpus: ${expectedTypes.length} v2 types from manifest.json (live union is not the inventory)`,
	);
	assert.equal(
		files.length > 0,
		true,
		"op-equality glob: 0 files — a glob that matches nothing cannot claim coverage",
	);
	assert.equal(
		manifest.documentOpMemberCount,
		30,
		`op-equality could-not-check: manifest documentOpMemberCount is ${manifest.documentOpMemberCount}, not 30`,
	);
	assert.equal(
		expectedTypes.length,
		30,
		`op-equality coverage: manifest lists ${expectedTypes.length} types, not 30`,
	);

	const claimed = new Map();
	const covered = new Set();
	for (const file of files) {
		const fixture = readFixtureFile(file);
		const actualTypes = (fixture.ops ?? []).map((op) => op.type);
		if (!actualTypes.includes(fixture.opType)) {
			throw new Error(
				`op-equality coverage: ${fixture.id}.json claims ${fixture.opType} but ops are ${actualTypes.join(",") || "(empty)"} (mislabelled)`,
			);
		}
		claimed.set(fixture.opType, fixture.id);
		for (const type of actualTypes) {
			covered.add(type);
		}
	}

	const missing = expectedTypes.filter((type) => {
		const entry = manifest.coverage[type];
		return (
			!claimed.has(type) ||
			!files.some((file) => file.endsWith(`/${entry.fixture}`))
		);
	});
	if (missing.length > 0) {
		throw new Error(`op-equality coverage: missing ${missing.join(", ")}`);
	}
	return { expectedTypes, files, covered };
}

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function seedStamp2LoneSentinelDocument() {
	const adapter = yjsAdapter();
	const doc = adapter.createDocument();
	const ydoc = adapter.raw(doc);
	ydoc.transact(() => {
		const blocks = ydoc.getMap("blocks");
		const blockOrder = ydoc.getArray("blockOrder");
		const metadata = ydoc.getMap("metadata");
		initBlockMap(blocks, "p1", "paragraph", "inline");
		blocks.get("p1").get("content").insert(0, "\u200B");
		blockOrder.push(["p1"]);
		metadata.set(PEN_FORMAT_METADATA_KEY, {
			format: 2,
			minReader: 1,
			writer: "0.0.1",
		});
	});
	return { adapter, binary: adapter.encodeState(doc) };
}

test("coverage is frozen to the committed v2 corpus, not the live union", () => {
	const { expectedTypes, files, covered } = checkCoverage();
	assert.equal(files.length, 30);
	assert.equal(expectedTypes.length, 30);
	for (const type of expectedTypes) {
		assert.equal(
			covered.has(type),
			true,
			`op-equality coverage: fixture ops never mention ${type}`,
		);
	}
});

test("each committed fixture replays to the bytes and snapshot on disk", () => {
	const files = listFixtureFiles();
	console.log(`op-equality replay glob: ${files.length} files`);
	assert.equal(files.length, 30);
	const replayed = [];
	for (const file of files) {
		const fixture = replayFixtureFile(file);
		replayed.push(fixture.id);
	}
	console.log(
		`op-equality replayed: ${replayed.length} [${replayed.join(", ")}]`,
	);
	assert.equal(
		replayed.length,
		30,
		`op-equality replayed ${replayed.length} fixtures, not 30`,
	);
});

test("table / layout / app fixtures nest; split / merge cross blocks", () => {
	const table = readFixtureFile(join(corpusDir, "insert-table-row.json"));
	const rows = table.initialSnapshot.blocks.tbl.tableContent;
	assert.ok(Array.isArray(rows), "insert-table-row initial table missing");
	assert.ok(rows.length >= 3, "insert-table-row is a flat 2-row default");
	assert.ok(rows[0].cells.length >= 2, "insert-table-row row 0 has no cells");
	assert.match(JSON.stringify(rows), /third-row/);

	const mergeCells = readFixtureFile(
		join(corpusDir, "merge-table-cells.json"),
	);
	assert.ok(
		mergeCells.initialSnapshot.blocks.tbl.tableContent.length >= 3,
		"merge-table-cells fixture is a flat table",
	);
	assert.ok(
		mergeCells.initialSnapshot.blocks.tbl.tableContent[0].cells.length >= 3,
		"merge-table-cells row 0 is not nested cells",
	);
	assert.deepEqual(
		mergeCells.snapshot.blocks.tbl.tableContent,
		mergeCells.initialSnapshot.blocks.tbl.tableContent,
		"v2 merge-table-cells is a no-op; a later real merge must not hide behind this fixture",
	);

	const splitCell = readFixtureFile(join(corpusDir, "split-table-cell.json"));
	assert.ok(
		splitCell.initialSnapshot.blocks.tbl.tableContent.length >= 3,
		"split-table-cell fixture is a flat table",
	);
	assert.ok(
		splitCell.initialSnapshot.blocks.tbl.tableContent[0].cells.length >= 3,
		"split-table-cell row 0 is not nested cells",
	);

	const deleteRow = readFixtureFile(join(corpusDir, "delete-table-row.json"));
	assert.ok(
		deleteRow.initialSnapshot.blocks.tbl.tableContent.length >= 3,
		"delete-table-row fixture is not a 3-row table",
	);
	assert.ok(
		deleteRow.snapshot.blocks.tbl.tableContent.length <
			deleteRow.initialSnapshot.blocks.tbl.tableContent.length,
		"delete-table-row did not drop a row",
	);

	const layout = readFixtureFile(join(corpusDir, "update-layout.json"));
	assert.ok(
		layout.initialSnapshot.blocks.toggle.children.includes("child"),
		"update-layout parent has no nested child id",
	);
	assert.equal(
		layout.initialSnapshot.blocks.child.content.delta[0].insert,
		"Nested child",
	);
	assert.equal(layout.snapshot.blocks.toggle.layout.display, "flex");
	assert.equal(layout.snapshot.blocks.toggle.layout.gap, 8);

	const app = readFixtureFile(join(corpusDir, "create-app.json"));
	assert.equal(app.ops[0].placement.mode, "anchored");
	assert.equal(app.ops[0].placement.blockId, "child");
	assert.ok(
		app.initialSnapshot.blocks.toggle.children.includes("child"),
		"create-app is not nested under a parent",
	);
	assert.equal(app.snapshot.apps["app-1"].type, "calendar");

	const split = readFixtureFile(join(corpusDir, "split-block.json"));
	assert.equal(split.initialSnapshot.blockOrder.length, 1);
	assert.ok(
		split.snapshot.blockOrder.length >
			split.initialSnapshot.blockOrder.length,
		"split-block stayed in one block",
	);
	const afterIds = split.snapshot.blockOrder;
	const left = JSON.stringify(split.snapshot.blocks[afterIds[0]].content);
	const right = JSON.stringify(split.snapshot.blocks[afterIds[1]].content);
	assert.match(left, /Hello/);
	assert.match(right, /World/);

	const merge = readFixtureFile(join(corpusDir, "merge-blocks.json"));
	assert.ok(
		merge.initialSnapshot.blockOrder.length >= 2,
		"merge-blocks started with one block",
	);
	assert.ok(
		merge.snapshot.blockOrder.length <
			merge.initialSnapshot.blockOrder.length,
		"merge-blocks did not cross a block boundary",
	);
	assert.match(
		JSON.stringify(merge.snapshot.blocks.p1.content),
		/HelloWorld|Hello.*World/,
	);

	const setSelection = readFixtureFile(join(corpusDir, "set-selection.json"));
	assert.equal(setSelection.selectionAfter.type, "text");
	assert.equal(setSelection.selectionAfter.focus.blockId, "p2");
	assert.equal(setSelection.selectionAfter.focus.offset, 5);
	assert.notEqual(
		setSelection.selectionAfter.focus.blockId,
		"p1",
		"set-selection did not leave the first block",
	);
});

test("corrupt committed updateBytes fails by name", () => {
	const file = join(corpusDir, "insert-text.json");
	const original = readFileSync(file, "utf8");
	try {
		const fixture = JSON.parse(original);
		const bytes = Buffer.from(fixture.updateBytes, "base64");
		assert.ok(bytes.length > 0, "insert-text updateBytes are empty");
		bytes[0] ^= 0xff;
		fixture.updateBytes = bytes.toString("base64");
		writeFileSync(file, `${JSON.stringify(fixture, null, "\t")}\n`);
		assert.throws(
			() => replayFixtureFile(file),
			/op-equality update-bytes mismatch: insert-text/,
		);
	} finally {
		writeFileSync(file, original);
	}
});

test("mislabelled fixture fails coverage by name", () => {
	const file = join(corpusDir, "insert-text.json");
	const original = readFileSync(file, "utf8");
	try {
		const fixture = JSON.parse(original);
		fixture.opType = "split-block";
		writeFileSync(file, `${JSON.stringify(fixture, null, "\t")}\n`);
		assert.throws(
			() => checkCoverage(),
			/op-equality coverage: insert-text\.json claims split-block but ops are insert-text \(mislabelled\)/,
		);
	} finally {
		writeFileSync(file, original);
	}
});

test("exact-match updateBytes fail because load-migration delete-set drift must stay visible", () => {
	const file = join(corpusDir, "insert-text.json");
	const original = readFileSync(file, "utf8");
	try {
		const fixture = JSON.parse(original);
		const session = createCorpusSession();
		try {
			applySetup(session, fixture.setup);
			const captured = captureApply(session, () => {
				applyReplayOps(session, fixture.ops);
			});
			fixture.updateBytes = encodeUpdateBytes(captured.update);
		} finally {
			destroyCorpusSession(session);
		}
		writeFileSync(file, `${JSON.stringify(fixture, null, "\t")}\n`);
		assert.throws(
			() => replayFixtureFile(file),
			/op-equality update-bytes mismatch: insert-text: load-migration delete-set drift vanished/,
		);
	} finally {
		writeFileSync(file, original);
	}
});

test("divergent block content fails snapshot by name", () => {
	const file = join(corpusDir, "insert-text.json");
	const original = readFileSync(file, "utf8");
	try {
		const fixture = JSON.parse(original);
		fixture.snapshot.blocks.p1.content.delta[0].insert = "CORRUPTED";
		writeFileSync(file, `${JSON.stringify(fixture, null, "\t")}\n`);
		assert.throws(
			() => replayFixtureFile(file),
			/op-equality snapshot mismatch: insert-text/,
		);
	} finally {
		writeFileSync(file, original);
	}
});

test("poisoned non-excluded metadata fails snapshot by name", () => {
	const file = join(corpusDir, "insert-text.json");
	const original = readFileSync(file, "utf8");
	try {
		const fixture = JSON.parse(original);
		fixture.initialSnapshot.metadata.documentProfile = "plain";
		writeFileSync(file, `${JSON.stringify(fixture, null, "\t")}\n`);
		assert.throws(
			() => replayFixtureFile(file),
			/op-equality initial-snapshot mismatch: insert-text/,
		);
	} finally {
		writeFileSync(file, original);
	}
});

test("stamp-2 lone sentinel still migrates and records the ledger", () => {
	const { adapter, binary } = seedStamp2LoneSentinelDocument();
	const editor = createHeadlessEditor({
		crdt: adapter,
		document: adapter.loadDocument(binary),
		schema: defaultSchema,
		preset: noDefaultExtensionsPreset,
	});
	try {
		assert.equal(readFormatStamp(editor.internals.crdtDoc).format, 3);
		assert.equal(editor.getBlock("p1")?.textContent(), "");
		const ydoc = adapter.raw(editor.internals.crdtDoc);
		const stored = ydoc.getMap("blocks").get("p1").get("content").toString();
		assert.equal(stored, "");
		assert.deepEqual(
			ydoc.getMap("metadata").get(MIGRATION_LEDGER_METADATA_KEY),
			[STRIP_EMPTY_BLOCK_ZWSP_ID],
		);
	} finally {
		editor.destroy();
	}
});

test("hidden fixture fails coverage by name", () => {
	const file = join(corpusDir, "replace-text.json");
	const original = readFileSync(file, "utf8");
	try {
		unlinkSync(file);
		assert.throws(
			() => checkCoverage(),
			/op-equality coverage: missing replace-text/,
		);
	} finally {
		writeFileSync(file, original);
	}
});

test("replay translates a shape-changed op and still compares the document snapshot", () => {
	const fixture = readFixtureFile(join(corpusDir, "insert-text.json"));
	const recorded = fixture.ops[0];
	const translated = translateRecordedOp(recorded);
	assert.equal(recorded.type, "insert-text");
	assert.equal(translated[0].type, "splice-text");
	assert.notDeepEqual(translated[0], recorded);
	assert.equal(translated[0].blockId, recorded.blockId);
	assert.equal(translated[0].from, recorded.offset);
	assert.equal(translated[0].to, recorded.offset);
	assert.equal(translated[0].insert, recorded.text);

	const today = opsForReplay(fixture.ops, {
		liveTypes: new Set(fixture.ops.map((op) => op.type)),
	});
	assert.deepEqual(today, fixture.ops);

	const afterRewrite = opsForReplay(fixture.ops, {
		liveTypes: new Set(["splice-text", "insert-block", "delete-block"]),
	});
	assert.deepEqual(afterRewrite, translated);
	assert.notEqual(afterRewrite[0].type, fixture.ops[0].type);

	const session = createCorpusSession();
	try {
		applySetup(session, fixture.setup);
		applyReplayOps(session, fixture.ops);
		assertCorpusSnapshot(
			snapshotSession(session),
			fixture.snapshot,
			"replay oracle is the committed snapshot, not the recorded op shape",
		);
	} finally {
		destroyCorpusSession(session);
	}
});

test("translation is on, fail-closed, and every folded fixture is exercised", () => {
	const liveTypes = readLiveOpTypeSet();
	assert.equal(
		liveTypes.has("splice-text"),
		true,
		"op-equality translation gate is off — opsForReplay would pass v2 shapes through",
	);
	assert.equal(
		liveTypes.has("insert-text"),
		false,
		"op-equality live union still names insert-text; replay would not translate",
	);

	assert.throws(
		() =>
			translateRecordedOp({
				type: "split-block",
				blockId: "p1",
				offset: 5,
				newBlockId: "n",
			}),
		/split-block needs readBlock\("p1"\)/,
	);
	assert.throws(
		() =>
			translateRecordedOp({
				type: "merge-blocks",
				targetBlockId: "p1",
				sourceBlockId: "p2",
			}),
		/merge-blocks needs readBlock\("p1"\) and readBlock\("p2"\)/,
	);
	assert.throws(
		() => translateRecordedOp({ type: "not-a-recorded-op" }),
		/unknown recorded type not-a-recorded-op/,
	);

	const files = listFixtureFiles();
	const replayed = [];
	const foldedExercised = [];
	for (const file of files) {
		const fixture = readFixtureFile(file);
		const session = createCorpusSession();
		try {
			applySetup(session, fixture.setup);
			const context = createReplayContext(session);
			assert.ok(
				context.readBlock,
				`op-equality ${fixture.id}: replay context missing readBlock`,
			);
			if (fixture.opType === "split-block") {
				assert.ok(
					context.readBlock(fixture.ops[0].blockId),
					`op-equality split-block replay has no block ${fixture.ops[0].blockId}`,
				);
			}
			if (fixture.opType === "merge-blocks") {
				assert.ok(
					context.readBlock(fixture.ops[0].targetBlockId) &&
						context.readBlock(fixture.ops[0].sourceBlockId),
					"op-equality merge-blocks replay is missing target or source",
				);
			}
			const translated = opsForReplay(fixture.ops, {
				liveTypes,
				context,
			});
			for (const op of translated) {
				if (isSetSelectionReplay(op)) {
					continue;
				}
				assert.equal(
					liveTypes.has(op.type),
					true,
					`op-equality ${fixture.id}: translated type ${op.type} is not in the live union`,
				);
			}
			for (const recorded of fixture.ops) {
				if (recorded.type === "set-selection") {
					assert.equal(isSetSelectionReplay(translated[0]), true);
					continue;
				}
				if (
					recorded.type === "split-block" ||
					recorded.type === "merge-blocks"
				) {
					assert.ok(
						translated.some((op) => op.type === "splice-text"),
						`op-equality ${fixture.id}: ${recorded.type} produced no splice-text`,
					);
					foldedExercised.push(recorded.type);
					continue;
				}
				if (!liveTypes.has(recorded.type)) {
					assert.equal(
						translated.some((op) => op.type === recorded.type),
						false,
						`op-equality ${fixture.id}: ${recorded.type} passed through after rewrite`,
					);
					foldedExercised.push(recorded.type);
				} else if (
					recorded.type === "format-text" &&
					typeof recorded.offset === "number"
				) {
					const format = translated.find(
						(op) => op.type === "format-text",
					);
					assert.equal(typeof format?.from, "number");
					assert.equal(typeof format?.offset, "undefined");
					foldedExercised.push(recorded.type);
				}
			}
			replayed.push(fixture.id);
		} finally {
			destroyCorpusSession(session);
		}
	}
	const uniqueFolded = [...new Set(foldedExercised)].sort();
	console.log(
		`op-equality translated fixtures: ${replayed.length} folded-types: ${uniqueFolded.length} [${uniqueFolded.join(", ")}]`,
	);
	assert.equal(replayed.length, 30);
	assert.equal(
		uniqueFolded.length,
		24,
		`op-equality folded types exercised: ${uniqueFolded.length}, not 24 (30 v2 minus 5 unchanged primitives minus set-selection)`,
	);
	assert.ok(
		uniqueFolded.includes("split-block") &&
			uniqueFolded.includes("merge-blocks"),
		"op-equality folded split/merge were not exercised with readBlock",
	);
});
