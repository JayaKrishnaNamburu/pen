#!/usr/bin/env node
/**
 * SCALE4 retainer inspector. Not a gate. Writes heap snapshots and prints
 * constructor counts plus retainer paths for Doc / EditorImpl leftovers.
 *
 *   SCALE4_SOAK_ITERATIONS=80 node --expose-gc packages/tooling/bench/src/soak/inspectRetainers.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { writeHeapSnapshot } from "node:v8";
import { Session } from "node:inspector/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createTestEditor,
	createTwoPeerHarness,
} from "@input/pen-test";

const require = createRequire(import.meta.url);
const { parseHeapSnapshot } = require("./parseHeapSnapshot.cjs");

const SCALE4_SOAK_ITERATIONS_ENV = "SCALE4_SOAK_ITERATIONS";
const DEFAULT_ITERATIONS = 80;
const BASELINE_BLOCKS = 32;
const SESSION_BLOCKS = 48;
const FACET_STATE_KEY = Symbol.for("@input/pen-core:facetState");

function readIterations() {
	const raw = process.env[SCALE4_SOAK_ITERATIONS_ENV];
	if (raw == null || raw === "") return DEFAULT_ITERATIONS;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error(`${SCALE4_SOAK_ITERATIONS_ENV} must be a positive integer`);
	}
	return parsed;
}

function collectGarbage() {
	if (typeof globalThis.gc === "function") {
		globalThis.gc();
		globalThis.gc();
		globalThis.gc();
		return true;
	}
	return false;
}

function heapUsed() {
	return process.memoryUsage().heapUsed;
}

function formatMiB(bytes) {
	return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function paragraphBlocks(count, label) {
	return Array.from({ length: count }, (_, i) => ({
		type: "paragraph",
		content: `${label} ${i}`,
	}));
}

async function createEditor(blockCount, label) {
	const editor = createTestEditor({
		blocks: paragraphBlocks(blockCount, label),
	});
	await editor.whenReady();
	return editor;
}

async function destroyEditor(editor) {
	const ydoc = editor.ydoc;
	await editor.destroy();
	ydoc.destroy();
}

function insertOn(editor, offset, text) {
	const id = editor.document.blockOrder.get(offset % editor.blockCount());
	editor.apply(
		[{ type: "insert-text", blockId: id, offset: 0, text }],
		{ origin: "user" },
	);
}

function streamAiTokens(editor, token) {
	const block = editor.firstBlock();
	if (!block) return;
	const writer = editor.openTextStream(
		{ blockId: block.id },
		{ origin: "ai", flushIntervalMs: 0 },
	);
	writer.append(token);
	writer.flush();
	writer.close();
}

async function destroyHarness(harness) {
	await destroyEditor(harness.peerA.editor);
	await destroyEditor(harness.peerB.editor);
}

async function createHarness() {
	const harness = createTwoPeerHarness({
		blocks: paragraphBlocks(8, "peer"),
	});
	await Promise.all([
		harness.peerA.editor.whenReady(),
		harness.peerB.editor.whenReady(),
	]);
	return harness;
}

function tickSession(session, harness, i) {
	insertOn(session, i, "e");
	insertOn(session, i + 1, "d");
	insertOn(session, i + 2, "i");
	insertOn(session, i + 3, "t");
	if (session.undoManager.canUndo()) session.undoManager.undo();
	if (session.undoManager.canRedo()) session.undoManager.redo();
	if (i % 3 === 0) {
		const peerBlock = harness.peerA.editor.firstBlock();
		if (peerBlock) {
			harness.peerA.editor.apply(
				[
					{
						type: "insert-text",
						blockId: peerBlock.id,
						offset: 0,
						text: "r",
					},
				],
				{ origin: "user" },
			);
			harness.exchange();
		}
	}
	if (i % 4 === 0) {
		streamAiTokens(session, `s${i}`);
	}
}

function inspectFacetProcessState() {
	const state = globalThis[FACET_STATE_KEY];
	if (!state) {
		return { present: false };
	}
	const names = [...state.specsByName.keys()].sort();
	const heldEditors = [];
	const seen = new Set();
	const walk = (value, path) => {
		if (value == null || typeof value !== "object") return;
		if (seen.has(value)) return;
		seen.add(value);
		if (
			typeof value.destroy === "function" &&
			typeof value.apply === "function" &&
			"undoManager" in value
		) {
			heldEditors.push(path);
			return;
		}
		if (seen.size > 400) return;
		if (value instanceof Map) {
			for (const [key, entry] of value) {
				walk(entry, `${path}.get(${JSON.stringify(key)})`);
			}
			return;
		}
		for (const key of Object.keys(value)) {
			walk(value[key], `${path}.${key}`);
		}
	};
	for (const [name, spec] of state.specsByName) {
		walk(spec, `specsByName[${JSON.stringify(name)}]`);
	}
	return {
		present: true,
		providerRecords: state.providerRecords instanceof WeakMap,
		facetSpecs: state.facetSpecs instanceof WeakMap,
		specsByNameSize: names.length,
		specsByName: names,
		heldEditors,
	};
}

async function countByPrototype(label, prototype) {
	const session = new Session();
	session.connect();
	try {
		globalThis.__penInspectProbe = { proto: prototype };
		const { result } = await session.post("Runtime.evaluate", {
			expression: "globalThis.__penInspectProbe.proto",
			objectGroup: "pen-inspect",
		});
		if (!result.objectId) {
			return { label, error: "no objectId for prototype" };
		}
		const { objects } = await session.post("Runtime.queryObjects", {
			prototypeObjectId: result.objectId,
			objectGroup: "pen-inspect",
		});
		const props = await session.post("Runtime.getProperties", {
			objectId: objects.objectId,
			ownProperties: true,
		});
		const count = props.result.filter((entry) => /^\d+$/.test(entry.name)).length;
		await session.post("Runtime.releaseObjectGroup", {
			objectGroup: "pen-inspect",
		});
		return { label, count };
	} finally {
		delete globalThis.__penInspectProbe;
		session.disconnect();
	}
}

async function writeAndParseSnapshot(tag, outDir) {
	collectGarbage();
	const snapshotPath = writeHeapSnapshot(join(outDir, `${tag}.heapsnapshot`));
	const report = parseHeapSnapshot(snapshotPath, {
		names: [
			"EditorImpl",
			"Doc",
			"StructStore",
			"Item",
			"DocumentSessionImpl",
			"FacetRegistryImpl",
			"UndoManager",
			"ApplyPipeline",
			"ExtensionManagerImpl",
			"YText",
			"YMap",
			"YArray",
		],
		maxPaths: 8,
	});
	await writeFile(
		join(outDir, `${tag}.json`),
		JSON.stringify(report, null, 2),
	);
	return { snapshotPath, report };
}

function printConstructorTable(report) {
	const rows = Object.values(report.constructors).sort(
		(a, b) => b.retainedApprox - a.retainedApprox,
	);
	for (const row of rows) {
		console.log(
			`  ${row.name.padEnd(22)} count=${String(row.count).padStart(5)}  self=${formatMiB(row.selfSize)}  ~retained=${formatMiB(row.retainedApprox)}`,
		);
	}
}

function printPaths(report) {
	for (const [name, paths] of Object.entries(report.paths)) {
		if (paths.length === 0) continue;
		console.log(`\nretainers for ${name}:`);
		for (const path of paths) {
			console.log(`  #${path.nodeId} self=${formatMiB(path.selfSize)}`);
			for (const step of path.steps) {
				console.log(`    ← ${step}`);
			}
		}
	}
}

async function run() {
	const iterations = readIterations();
	const usedGc = collectGarbage();
	const outDir = join(tmpdir(), `pen-soak-retainers-${Date.now()}`);
	await mkdir(outDir, { recursive: true });

	console.log(`SCALE4 retainer inspect  iterations=${iterations}  gc=${usedGc}`);
	console.log(`output: ${outDir}`);

	const warmupSession = await createEditor(SESSION_BLOCKS, "warmup-session");
	const warmupHarness = await createHarness();
	tickSession(warmupSession, warmupHarness, 0);
	await destroyEditor(warmupSession);
	await destroyHarness(warmupHarness);
	const warmupBaseline = await createEditor(BASELINE_BLOCKS, "warmup-baseline");
	await destroyEditor(warmupBaseline);
	collectGarbage();
	const warmupBytes = heapUsed();
	console.log(`warmup-empty: ${formatMiB(warmupBytes)}`);

	const baselineHeld = await (async () => {
		const editor = await createEditor(BASELINE_BLOCKS, "baseline");
		collectGarbage();
		const bytes = heapUsed();
		return { editor, bytes };
	})();
	const baselineBytes = baselineHeld.bytes;
	const held = await (async () => {
		let session = await createEditor(SESSION_BLOCKS, "session");
		const harness = await createHarness();
		globalThis.__penInspectProtos = {
			editor: Object.getPrototypeOf(session),
			ydoc: Object.getPrototypeOf(session.ydoc),
		};
		for (let i = 0; i < iterations; i++) {
			tickSession(session, harness, i);
			if (i % 8 === 7) {
				await destroyEditor(session);
				session = await createEditor(SESSION_BLOCKS, "session");
			}
		}
		await destroyEditor(session);
		await destroyHarness(harness);
		const recreated = await createEditor(BASELINE_BLOCKS, "recreate");
		collectGarbage();
		return {
			bytes: heapUsed(),
			session,
			harness,
			recreated,
			baselineEditor: baselineHeld.editor,
		};
	})();
	const heldBytes = held.bytes;
	const heldRatio = heldBytes / baselineBytes;
	console.log(
		`\nheld locals (current soak): baseline=${formatMiB(baselineBytes)} post=${formatMiB(heldBytes)} ratio=${heldRatio.toFixed(3)}`,
	);

	const facetHeld = inspectFacetProcessState();
	console.log("\nfacet process state:");
	console.log(JSON.stringify(facetHeld, null, 2));

	const protoCountsHeld = [
		await countByPrototype("EditorImpl", globalThis.__penInspectProtos.editor),
		await countByPrototype("Y.Doc", globalThis.__penInspectProtos.ydoc),
	];
	console.log("\nqueryObjects while soak locals are live:");
	console.log(JSON.stringify(protoCountsHeld, null, 2));

	console.log("\nheap snapshot (locals held):");
	const heldSnap = await writeAndParseSnapshot("held-locals", outDir);
	printConstructorTable(heldSnap.report);
	printPaths(heldSnap.report);

	await destroyEditor(held.baselineEditor);
	await destroyEditor(held.recreated);
	held.session = undefined;
	held.harness = undefined;
	held.recreated = undefined;
	held.baselineEditor = undefined;
	collectGarbage();
	const droppedEmpty = heapUsed();

	const afterDrop = await (async () => {
		const recreated = await createEditor(BASELINE_BLOCKS, "recreate-after-drop");
		collectGarbage();
		return { recreated, bytes: heapUsed() };
	})();
	const droppedBytes = afterDrop.bytes;
	const droppedRatio = droppedBytes / baselineBytes;
	console.log(
		`\ndropped locals: empty=${formatMiB(droppedEmpty)} post=${formatMiB(droppedBytes)} ratio=${droppedRatio.toFixed(3)}`,
	);

	const protoCountsDropped = [
		await countByPrototype("EditorImpl", globalThis.__penInspectProtos.editor),
		await countByPrototype("Y.Doc", globalThis.__penInspectProtos.ydoc),
	];
	console.log("\nqueryObjects after dropping soak locals:");
	console.log(JSON.stringify(protoCountsDropped, null, 2));

	console.log("\nheap snapshot (locals dropped):");
	const droppedSnap = await writeAndParseSnapshot("dropped-locals", outDir);
	printConstructorTable(droppedSnap.report);
	printPaths(droppedSnap.report);

	await destroyEditor(afterDrop.recreated);
	delete globalThis.__penInspectProtos;
	collectGarbage();
	console.log(`\nfinal-empty: ${formatMiB(heapUsed())}`);
	console.log(`snapshots: ${heldSnap.snapshotPath}`);
	console.log(`           ${droppedSnap.snapshotPath}`);
}

run().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
