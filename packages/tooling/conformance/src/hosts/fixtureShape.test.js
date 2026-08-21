/**
 * Construction lock for conformance fixtures. A fixture named for a hard
 * case that is shaped like the easy case is how HOST6 empty-click shipped
 * green. These assertions read the committed files, not the names.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("../../fixtures/", import.meta.url));

function readFixture(rel) {
	return readFileSync(join(fixturesDir, rel), "utf8");
}

function sliceBetween(source, start, end) {
	const from = source.indexOf(start);
	assert.notEqual(from, -1, `missing ${start}`);
	const to = source.indexOf(end, from);
	assert.notEqual(to, -1, `missing ${end} after ${start}`);
	return source.slice(from, to);
}

function contentLiterals(source) {
	return [...source.matchAll(/content:\s*("(?:\\.|[^"])*")/g)].map(
		(match) => match[1],
	);
}

test("empty is letterless; hello-world is not", () => {
	const catalog = readFixture("catalog.ts");
	const empty = sliceBetween(catalog, "empty: [", '"two-paragraph"');
	assert.match(empty, /id:\s*"empty-p1"/);
	assert.deepEqual(contentLiterals(empty), ['""']);

	const hello = sliceBetween(catalog, '"hello-world": [', "empty: [");
	assert.deepEqual(contentLiterals(hello), ['"Hello world"']);
});

test("nested-toggle has a child by construction", () => {
	const catalog = readFixture("catalog.ts");
	const nested = sliceBetween(catalog, '"nested-toggle": [', "};");
	assert.match(nested, /type:\s*"toggle"/);
	assert.match(nested, /children:\s*\[/);
	assert.match(nested, /NESTED_TOGGLE_CHILD_TEXT/);
	assert.match(catalog, /NESTED_TOGGLE_CHILD_TEXT = "Nested child"/);
});

test("bidi-mixed is mixed LTR/RTL by construction", () => {
	const bidi = readFixture("bidi.ts");
	assert.match(bidi, /direction:\s*"ltr"/);
	assert.match(bidi, /direction:\s*"rtl"/);
	assert.match(bidi, /مرحبا/);
	assert.match(bidi, /שלום/);
	assert.match(bidi, /Hello/);
});

test("wave3-geometry: empty is empty; g5-atoms is plain latin", () => {
	const catalog = readFixture("catalog.ts");
	const wave = sliceBetween(catalog, '"wave3-geometry": [', '"bidi-mixed"');
	const empty = sliceBetween(wave, 'id: "g5-empty"', 'id: "g5-atoms"');
	assert.deepEqual(contentLiterals(empty), ['""']);

	const atoms = sliceBetween(wave, 'id: "g5-atoms"', 'id: "g5-tail"');
	assert.deepEqual(contentLiterals(atoms), ['"LEFT WRAP ATOM LINE"']);
});

test("hostile corpus files carry a live xss probe", () => {
	const probe = "window.__xssProbe()";
	const files = [
		"hostile/urls.html",
		"hostile/event-handlers.html",
		"hostile/attribute-breakout.html",
		"hostile/mxss.html",
		"hostile/css-expression.html",
		"hostile/malformed.html",
	];
	for (const file of files) {
		const body = readFixture(file);
		assert.ok(body.includes(probe), `${file} has no live probe`);
		assert.doesNotMatch(body, /lorem ipsum|Hello world/i);
	}

	const vectors = readFixture("hostile/vectors.ts");
	assert.match(vectors, /XSS_PROBE = "window\.__xssProbe\(\)"/);
	assert.match(vectors, /javascript:\$\{XSS_PROBE\}/);
	assert.match(vectors, /function oversizedDepthDocument/);
	assert.match(vectors, /function oversizedCountDocument/);

	const proto = JSON.parse(readFixture("hostile/proto-keys.json"));
	const props = proto.blocks[0].props;
	assert.equal(
		Object.prototype.hasOwnProperty.call(props, "__proto__"),
		true,
	);
	assert.equal(
		Object.prototype.hasOwnProperty.call(props, "constructor"),
		true,
	);
	assert.equal(
		Object.prototype.hasOwnProperty.call(props, "prototype"),
		true,
	);
	assert.equal(
		Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"),
		false,
	);
});

test("windowed-large is many top-level paragraphs, not nested", () => {
	const catalog = readFixture("catalog.ts");
	assert.match(catalog, /WINDOWED_LARGE_BLOCK_COUNT = 40/);
	const windowed = sliceBetween(
		catalog,
		"function windowedLargeBlocks",
		"export const LOCAL_FIXTURES",
	);
	assert.match(windowed, /type:\s*"paragraph"/);
	assert.doesNotMatch(windowed, /children/);
});
