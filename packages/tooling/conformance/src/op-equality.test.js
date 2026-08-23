/**
 * Wave 4 GATE 4.5 — update-equality corpus.
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
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
	countTightDocumentOpMembers,
	readLiveDocumentOpTypes,
} from "./opCorpus/liveUnion.js";
import {
	applySetup,
	captureApply,
	createCorpusSession,
	destroyCorpusSession,
	snapshotSession,
} from "./opCorpus/session.js";
import { encodeUpdateBytes } from "./opCorpus/snapshot.js";

const corpusDir = fileURLToPath(
	new URL("../corpus/op-equality/", import.meta.url),
);
const opsTsPath = fileURLToPath(
	new URL("../../../types/src/types/ops.ts", import.meta.url),
);

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
		assert.deepEqual(
			initial,
			fixture.initialSnapshot,
			`op-equality initial-snapshot mismatch: ${fixture.id}`,
		);
		const captured = captureApply(session, () => {
			session.editor.apply(fixture.ops, { origin: "user" });
		});
		const actualBytes = encodeUpdateBytes(captured.update);
		assert.equal(
			actualBytes,
			fixture.updateBytes,
			`op-equality update-bytes mismatch: ${fixture.id}`,
		);
		assert.deepEqual(
			snapshotSession(session),
			fixture.snapshot,
			`op-equality snapshot mismatch: ${fixture.id}`,
		);
		return fixture;
	} finally {
		destroyCorpusSession(session);
	}
}

function checkCoverage() {
	const opsSource = readFileSync(opsTsPath, "utf8");
	const tightCount = countTightDocumentOpMembers(opsSource);
	const live = readLiveDocumentOpTypes(opsSource);
	const files = listFixtureFiles();
	console.log(
		`op-equality glob: ${files.length} files (pattern corpus/op-equality/*.json excluding manifest.json)`,
	);
	console.log(
		`op-equality live union: ${tightCount} members via ^\\s*\\| [A-Z][A-Za-z]+Op on packages/types/src/types/ops.ts`,
	);
	assert.equal(
		files.length > 0,
		true,
		"op-equality glob: 0 files — a glob that matches nothing cannot claim coverage",
	);
	assert.equal(
		tightCount,
		30,
		`op-equality could-not-check: tight DocumentOp count is ${tightCount}, not 30`,
	);
	assert.equal(live.length, tightCount);

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

	const missing = live
		.map((entry) => entry.type)
		.filter((type) => !covered.has(type));
	if (missing.length > 0) {
		throw new Error(
			`op-equality coverage: missing ${missing.join(", ")}`,
		);
	}
	return { live, files, covered };
}

test("coverage is verified against the live DocumentOp union", () => {
	const { live, files, covered } = checkCoverage();
	assert.equal(files.length, 30);
	assert.equal(covered.size, live.length);
});

test("each committed fixture replays to the bytes and snapshot on disk", () => {
	const files = listFixtureFiles();
	console.log(`op-equality replay glob: ${files.length} files`);
	assert.equal(files.length, 30);
	for (const file of files) {
		replayFixtureFile(file);
	}
});

test("table / layout / app fixtures nest; split / merge cross blocks", () => {
	const table = readFixtureFile(join(corpusDir, "insert-table-row.json"));
	const rows = table.initialSnapshot.blocks.tbl.tableContent;
	assert.ok(Array.isArray(rows), "insert-table-row initial table missing");
	assert.ok(rows.length >= 3, "insert-table-row is a flat 2-row default");
	assert.ok(
		rows[0].cells.length >= 2,
		"insert-table-row row 0 has no cells",
	);
	assert.match(JSON.stringify(rows), /third-row/);

	const mergeCells = readFixtureFile(join(corpusDir, "merge-table-cells.json"));
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
		split.snapshot.blockOrder.length > split.initialSnapshot.blockOrder.length,
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
		merge.snapshot.blockOrder.length < merge.initialSnapshot.blockOrder.length,
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
