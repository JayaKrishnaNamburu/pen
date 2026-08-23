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
	const literals = [];
	const marker = "content:";
	let from = 0;
	while (from < source.length) {
		const at = source.indexOf(marker, from);
		if (at === -1) {
			break;
		}
		let i = at + marker.length;
		while (i < source.length && (source[i] === " " || source[i] === "\t")) {
			i += 1;
		}
		if (source[i] !== '"') {
			from = at + marker.length;
			continue;
		}
		const start = i;
		i += 1;
		let escaped = false;
		while (i < source.length) {
			const ch = source[i];
			if (escaped) {
				escaped = false;
				i += 1;
				continue;
			}
			if (ch === "\\") {
				escaped = true;
				i += 1;
				continue;
			}
			if (ch === '"') {
				literals.push(source.slice(start, i + 1));
				i += 1;
				break;
			}
			i += 1;
		}
		from = i;
	}
	return literals;
}

test("empty is letterless; hello-world is not", () => {
	const catalog = readFixture("catalog.ts");
	const empty = sliceBetween(catalog, "empty: [", '"two-paragraph"');
	assert.match(empty, /id:\s*"empty-p1"/);
	assert.deepEqual(contentLiterals(empty), ['""']);

	const hello = sliceBetween(catalog, '"hello-world": [', "empty: [");
	assert.deepEqual(contentLiterals(hello), ['"Hello world"']);
});

test("nested-toggle has a parentId child by construction", () => {
	const catalog = readFixture("catalog.ts");
	const nested = sliceBetween(
		catalog,
		'"nested-toggle": [',
		'"grapheme-clusters"',
	);
	assert.match(nested, /type:\s*"toggle"/);
	assert.match(nested, /id:\s*NESTED_TOGGLE_PARENT_ID/);
	assert.match(nested, /id:\s*NESTED_TOGGLE_CHILD_ID/);
	assert.match(nested, /parentId:\s*NESTED_TOGGLE_PARENT_ID/);
	assert.match(nested, /NESTED_TOGGLE_CHILD_TEXT/);
	assert.match(catalog, /NESTED_TOGGLE_CHILD_TEXT = "Nested child"/);
	assert.doesNotMatch(
		nested,
		/children:\s*\[/,
		"toggle children live in blockOrder with parentId, not a layout children array",
	);
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
	assert.match(windowed, /WINDOWED_LARGE_BLOCK_COUNT/);
	assert.doesNotMatch(windowed, /children/);
});

test("two-paragraph has two distinct letterful contents", () => {
	const catalog = readFixture("catalog.ts");
	const two = sliceBetween(catalog, '"two-paragraph": [', '"windowed-large"');
	const literals = contentLiterals(two);
	assert.equal(literals.length, 2);
	assert.notEqual(literals[0], literals[1]);
	assert.match(JSON.parse(literals[0]), /\p{L}/u);
	assert.match(JSON.parse(literals[1]), /\p{L}/u);
});

function quotedStrings(source) {
	return [...source.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) =>
		JSON.parse(`"${match[1]}"`),
	);
}

function namedString(source, name) {
	const match = source.match(
		new RegExp(`export const ${name} = "((?:\\\\.|[^"\\\\])*)"`),
	);
	assert.ok(match, `missing ${name}`);
	return JSON.parse(`"${match[1]}"`);
}

function multiCodepointGraphemes(text) {
	if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
		throw new Error("fixtureShape grapheme lock needs Intl.Segmenter");
	}
	const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
	return [...segmenter.segment(text)]
		.map((entry) => entry.segment)
		.filter((segment) => [...segment].length > 1);
}

test("grapheme-clusters ships ZWJ, combining, flag, and Indic/Thai clusters", () => {
	const catalog = readFixture("catalog.ts");
	const grapheme = readFixture("grapheme.ts");
	assert.match(catalog, /"grapheme-clusters"/);
	assert.match(catalog, /GRAPHEME_CLUSTER_BLOCKS/);

	const zwj = namedString(grapheme, "GRAPHEME_ZWJ_FAMILY");
	const combining = namedString(grapheme, "GRAPHEME_COMBINING");
	const flag = namedString(grapheme, "GRAPHEME_FLAG");
	const devanagari = namedString(grapheme, "GRAPHEME_DEVANAGARI");
	const thai = namedString(grapheme, "GRAPHEME_THAI");

	assert.ok(
		zwj.includes("\u200D"),
		"ZWJ family must contain U+200D",
	);
	assert.ok(
		combining.includes("\u0301"),
		"combining cluster must contain U+0301",
	);
	assert.equal([...flag].length, 2, "flag must be two regional indicators");
	assert.ok(
		/\p{Script=Devanagari}/u.test(devanagari),
		"Devanagari cluster missing",
	);
	assert.ok(/\p{Script=Thai}/u.test(thai), "Thai cluster missing");

	const required = { zwj, combining, flag, devanagari, thai };
	for (const [name, text] of Object.entries(required)) {
		const clusters = multiCodepointGraphemes(text);
		assert.ok(
			clusters.length > 0,
			`${name} is a single code point: ${JSON.stringify(text)}`,
		);
	}
});

test("no catalog fixture is named for graphemes while shipping single-codepoint text", () => {
	const catalog = readFixture("catalog.ts");
	const bidi = readFixture("bidi.ts");
	const grapheme = readFixture("grapheme.ts");
	const names = [...catalog.matchAll(/"([a-z0-9-]+)"/g)].map(
		(match) => match[1],
	);
	const graphemeNamed = names.filter((name) =>
		/grapheme|cluster|emoji/i.test(name),
	);
	assert.ok(
		graphemeNamed.includes("grapheme-clusters"),
		"grapheme-clusters fixture must exist so M6 is not the Hello-midword trap",
	);
	const texts = [
		...quotedStrings(catalog),
		...quotedStrings(bidi),
		...quotedStrings(grapheme),
	];
	for (const name of graphemeNamed) {
		const clusters = texts.flatMap((text) => multiCodepointGraphemes(text));
		assert.ok(
			clusters.length > 0,
			`${name} is named for a grapheme case but every cluster is one code point`,
		);
	}
});

test("bidi catalog extras are RTL with Arabic, not Latin-only", () => {
	const catalog = readFixture("catalog.ts");
	assert.match(catalog, /BIDI_DIGITS_RTL_TEXT = "مرحبا 123"/);
	assert.match(catalog, /BIDI_ATOM_RTL_TEXT = "مرحبا"/);
	assert.match(catalog, /direction:\s*"rtl"/);
});

test("hostile HTML files match the live vector strings", async () => {
	const { HOSTILE_HTML } = await import("../../fixtures/hostile/vectors.ts");
	const pairs = [
		["hostile/urls.html", HOSTILE_HTML.urls],
		["hostile/event-handlers.html", HOSTILE_HTML.eventHandlers],
		["hostile/attribute-breakout.html", HOSTILE_HTML.attributeBreakout],
		["hostile/mxss.html", HOSTILE_HTML.mxss],
		["hostile/css-expression.html", HOSTILE_HTML.cssExpression],
		["hostile/malformed.html", HOSTILE_HTML.malformed],
	];
	for (const [file, vector] of pairs) {
		assert.equal(
			readFixture(file).replaceAll("\r\n", "\n").trim(),
			vector.replaceAll("\r\n", "\n").trim(),
			`${file} drifted from HOSTILE_HTML`,
		);
	}
});

test("oversized builders are oversized by construction", async () => {
	const { oversizedDepthDocument, oversizedCountDocument } = await import(
		"../../fixtures/hostile/vectors.ts"
	);
	const depth = oversizedDepthDocument(4);
	let node = depth.blocks[0];
	let hops = 0;
	while (node?.children?.[0]) {
		node = node.children[0];
		hops += 1;
	}
	assert.equal(hops, 3);
	assert.equal(node.content.text, "leaf");

	const count = oversizedCountDocument(12);
	assert.equal(count.blocks.length, 12);
	assert.notEqual(count.blocks.length, 1);
});
