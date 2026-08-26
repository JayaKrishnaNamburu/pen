import assert from "node:assert/strict";
import * as Y from "yjs";

function toPlain(value) {
	if (value instanceof Y.Text) {
		return { kind: "text", delta: value.toDelta() };
	}
	if (value instanceof Y.Array) {
		return value.toArray().map(toPlain);
	}
	if (value instanceof Y.Map) {
		const out = {};
		for (const [key, child] of value.entries()) {
			out[key] = toPlain(child);
		}
		return out;
	}
	if (value instanceof Y.Doc) {
		return { kind: "subdoc", guid: value.guid };
	}
	if (Array.isArray(value)) {
		return value.map(toPlain);
	}
	if (value != null && typeof value === "object") {
		const out = {};
		for (const [key, child] of Object.entries(value)) {
			out[key] = toPlain(child);
		}
		return out;
	}
	return value;
}

function sortKeys(value) {
	if (Array.isArray(value)) {
		return value.map(sortKeys);
	}
	if (value != null && typeof value === "object") {
		const out = {};
		for (const key of Object.keys(value).sort()) {
			out[key] = sortKeys(value[key]);
		}
		return out;
	}
	return value;
}

export function snapshotDocument(_editor, ydoc) {
	const blocksMap = ydoc.getMap("blocks");
	const blocks = {};
	for (const [id, blockMap] of blocksMap.entries()) {
		blocks[id] = toPlain(blockMap);
	}
	return sortKeys({
		blockOrder: ydoc.getArray("blockOrder").toArray(),
		blocks,
		apps: toPlain(ydoc.getMap("apps")),
		metadata: toPlain(ydoc.getMap("metadata")),
	});
}

export function snapshotSelection(editor) {
	return sortKeys(JSON.parse(JSON.stringify(editor.selection)));
}

export function encodeUpdateBytes(bytes) {
	return Buffer.from(bytes).toString("base64");
}

/**
 * EM3 advanced the store-generation stamp from 2 to 3 and writes the
 * `strip-empty-block-sentinels` ledger on load of a stamp < 3 document.
 * The corpus was recorded on stamp 2 with no ledger; re-recording is
 * forbidden — these fixtures are the only surviving evidence of the
 * earlier op behaviour.
 *
 * Only `penFormat.format` and `penMigrations` are excluded.
 * `documentProfile` and every other metadata key stay compared, so a
 * poisoned profile still fails by name.
 *
 * Each exclusion is paired with a positive assertion: live format is 3,
 * the recording is 2, live ledger contains the migration id, and the
 * recording has no ledger. If the migration silently stopped running, or
 * if the corpus were re-recorded onto stamp 3, this fails before the
 * exclusion can hide it.
 */
export function assertCorpusSnapshot(actual, expected, label) {
	assertLoadMigrationDrift(actual?.metadata, expected?.metadata, label);
	assert.deepEqual(
		snapshotExcludingLoadMigrationDrift(actual),
		snapshotExcludingLoadMigrationDrift(expected),
		label,
	);
}

const STRIP_SENTINELS_MIGRATION_ID = "strip-empty-block-sentinels";

function assertLoadMigrationDrift(actualMeta, expectedMeta, label) {
	const actualFormat = actualMeta?.penFormat?.format;
	const expectedFormat = expectedMeta?.penFormat?.format;
	assert.equal(
		expectedFormat,
		2,
		`${label}: committed corpus stamp is ${expectedFormat}, not 2`,
	);
	assert.equal(
		actualFormat,
		3,
		`${label}: live stamp is ${actualFormat}, not 3`,
	);
	assert.equal(
		Object.prototype.hasOwnProperty.call(expectedMeta ?? {}, "penMigrations"),
		false,
		`${label}: committed corpus unexpectedly has penMigrations`,
	);
	assert.deepEqual(
		actualMeta?.penMigrations,
		[STRIP_SENTINELS_MIGRATION_ID],
		`${label}: live ledger is ${JSON.stringify(actualMeta?.penMigrations)}, not [${STRIP_SENTINELS_MIGRATION_ID}]`,
	);
}

function snapshotExcludingLoadMigrationDrift(snapshot) {
	const metadata = snapshot?.metadata;
	if (metadata == null || typeof metadata !== "object") {
		return snapshot;
	}
	const { penMigrations: _ledger, ...metadataRest } = metadata;
	const penFormat = metadataRest.penFormat;
	if (penFormat == null || typeof penFormat !== "object") {
		return { ...snapshot, metadata: metadataRest };
	}
	const { format: _format, ...stampRest } = penFormat;
	return {
		...snapshot,
		metadata: {
			...metadataRest,
			penFormat: stampRest,
		},
	};
}

/**
 * The no-op load migration writes one extra metadata item before
 * setup, which shifts this client's historical DeleteSet from `02 07`
 * to `03 06`. Command structs stay byte-identical except some parent
 * clocks that tick `07` → `08`.
 *
 * Re-recording is forbidden. A blanket byte skip would hide an op-shape
 * change; requiring exact equality would fail every fixture on the
 * DeleteSet tail. Allowed diffs are only that pair, plus at most one
 * `07` → `08` clock. Anything else — including a first-byte xor and a
 * vanished drift (exact match) — fails by name.
 */
export function assertCorpusUpdateBytes(actualB64, expectedB64, label) {
	const actual = Buffer.from(actualB64, "base64");
	const expected = Buffer.from(expectedB64, "base64");
	assert.equal(
		actual.length,
		expected.length,
		`${label}: length ${actual.length} !== ${expected.length}`,
	);
	const diffs = [];
	for (let i = 0; i < actual.length; i++) {
		if (actual[i] !== expected[i]) {
			diffs.push({ i, expected: expected[i], actual: actual[i] });
		}
	}
	assert.ok(
		diffs.length > 0,
		`${label}: load-migration delete-set drift vanished`,
	);
	let dsIndex = -1;
	for (let k = 0; k < diffs.length - 1; k++) {
		const a = diffs[k];
		const b = diffs[k + 1];
		if (
			b.i === a.i + 1 &&
			a.expected === 0x02 &&
			a.actual === 0x03 &&
			b.expected === 0x07 &&
			b.actual === 0x06
		) {
			dsIndex = k;
			break;
		}
	}
	assert.notEqual(
		dsIndex,
		-1,
		`${label}: missing load-migration delete-set shift 02 07 → 03 06`,
	);
	const rest = diffs.filter((_, k) => k !== dsIndex && k !== dsIndex + 1);
	for (const d of rest) {
		assert.ok(
			d.expected === 0x07 && d.actual === 0x08,
			`${label}: unexpected update byte at ${d.i}: ${d.expected} → ${d.actual}`,
		);
	}
	assert.ok(
		rest.length <= 1,
		`${label}: ${rest.length} extra clock diffs, not 0 or 1`,
	);
}
