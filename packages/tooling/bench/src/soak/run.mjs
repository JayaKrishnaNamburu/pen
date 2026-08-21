#!/usr/bin/env node
/**
 * SCALE4 nightly soak (`spec-v2/22-scale-envelope.md`).
 *
 * Heap during the session is a printed trend, not a gate. The only hard
 * assertion is post teardown-and-recreate vs the baseline sample.
 */
import { appendFile } from "node:fs/promises";
import {
	createTestEditor,
	createTwoPeerHarness,
} from "@input/pen-test";

const SCALE4_SOAK_ITERATIONS_ENV = "SCALE4_SOAK_ITERATIONS";
const DEFAULT_ITERATIONS = 24;

/**
 * SCALE4 hard bound: post teardown-and-recreate heap / baseline heap.
 *
 * The 1.159 nightly miss was the `run()` frame still rooting destroyed
 * session + two-peer editors. `Y.Doc.destroy()` does not empty
 * `StructStore` (yjs `Doc.js`), and those docs are created with
 * `gc: false`, so 400 iterations of peer history stayed on the heap
 * until the handle dropped. Heap paths:
 * stack → harness.peerA/peerB.editor._crdtDoc.ydoc.store → Item.
 * Sampling in child frames (so those handles are gone) measured
 * 1.049 / 1.045 / 1.049 at 24 and 1.080 / 1.077 / 1.073 at 400 on
 * macos-arm64 (darwin 25, `--expose-gc`, quiet machine). 1.13 is
 * unchanged. Do not raise it.
 */
const TEARDOWN_HEAP_MULTIPLE = 1.13;

const BASELINE_BLOCKS = 32;
const SESSION_BLOCKS = 48;

const samples = [];

function readIterations() {
	const raw = process.env[SCALE4_SOAK_ITERATIONS_ENV];
	if (raw == null || raw === "") {
		return DEFAULT_ITERATIONS;
	}
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error(
			`${SCALE4_SOAK_ITERATIONS_ENV} must be a positive integer, got ${JSON.stringify(raw)}`,
		);
	}
	return parsed;
}

function gcAvailable() {
	return typeof globalThis.gc === "function";
}

function collectGarbage() {
	if (!gcAvailable()) {
		return false;
	}
	// One pass misses large Y.Doc StructStores. Three is enough for the
	// teardown samples without hiding a live retainer.
	globalThis.gc();
	globalThis.gc();
	globalThis.gc();
	return true;
}

function heapUsed() {
	return process.memoryUsage().heapUsed;
}

function sample(phase) {
	collectGarbage();
	const bytes = heapUsed();
	samples.push({ index: samples.length, phase, bytes });
	return bytes;
}

function formatMiB(bytes) {
	return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return (sorted[mid - 1] + sorted[mid]) / 2;
	}
	return sorted[mid];
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
	const block = editor.firstBlock();
	if (!block) {
		throw new Error("SCALE4 soak: editor has no blocks");
	}
	const id = editor.document.blockOrder.get(offset % editor.blockCount());
	editor.apply(
		[
			{
				type: "insert-text",
				blockId: id,
				offset: 0,
				text,
			},
		],
		{ origin: "user" },
	);
}

function streamAiTokens(editor, token) {
	const block = editor.firstBlock();
	if (!block) {
		return;
	}
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
	if (session.undoManager.canUndo()) {
		session.undoManager.undo();
	}
	if (session.undoManager.canRedo()) {
		session.undoManager.redo();
	}
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

async function exerciseWorkloadOnce() {
	const session = await createEditor(SESSION_BLOCKS, "warmup-session");
	const harness = await createHarness();
	tickSession(session, harness, 0);
	await destroyEditor(session);
	await destroyHarness(harness);
	const baselineShape = await createEditor(BASELINE_BLOCKS, "warmup-baseline");
	await destroyEditor(baselineShape);
}

async function measureBaseline() {
	const editor = await createEditor(BASELINE_BLOCKS, "baseline");
	const bytes = sample("baseline-editor");
	await destroyEditor(editor);
	sample("baseline-destroyed");
	return bytes;
}

async function runSession(iterations) {
	let session = await createEditor(SESSION_BLOCKS, "session");
	const harness = await createHarness();

	for (let i = 0; i < iterations; i++) {
		tickSession(session, harness, i);
		if (i % 8 === 7) {
			await destroyEditor(session);
			session = await createEditor(SESSION_BLOCKS, "session");
		}
		if (i === 0 || i === iterations - 1 || i % 8 === 0) {
			sample(`session-${i}`);
		}
	}

	await destroyEditor(session);
	await destroyHarness(harness);
}

async function measureRecreate() {
	const editor = await createEditor(BASELINE_BLOCKS, "recreate");
	const bytes = sample("post-teardown-recreate");
	await destroyEditor(editor);
	sample("final-empty");
	return bytes;
}

function printReport({
	iterations,
	usedGc,
	baselineBytes,
	postBytes,
	ratio,
	passed,
}) {
	const bytes = samples.map((entry) => entry.bytes);
	const lines = [
		"SCALE4 soak",
		`gc: ${usedGc ? "forced via --expose-gc / globalThis.gc" : "unavailable; samples include unreclaimed garbage"}`,
		`iterations: ${iterations} (${SCALE4_SOAK_ITERATIONS_ENV}, default ${DEFAULT_ITERATIONS})`,
		`teardown multiple: ${TEARDOWN_HEAP_MULTIPLE} (named constant; session growth is not gated)`,
		"",
		"heap trend (process.memoryUsage().heapUsed):",
	];
	const phaseWidth = Math.max(...samples.map((entry) => entry.phase.length));
	for (const entry of samples) {
		lines.push(
			`  ${String(entry.index).padStart(3)}  ${entry.phase.padEnd(phaseWidth)}  ${formatMiB(entry.bytes)}  (${entry.bytes} B)`,
		);
	}
	lines.push("");
	lines.push(
		`summary: samples=${samples.length} min=${formatMiB(Math.min(...bytes))} median=${formatMiB(median(bytes))} max=${formatMiB(Math.max(...bytes))}`,
	);
	lines.push(
		`baseline: ${formatMiB(baselineBytes)}  post teardown-and-recreate: ${formatMiB(postBytes)}  ratio: ${ratio.toFixed(3)}`,
	);
	lines.push(
		passed
			? `SCALE4 teardown assertion: passed (${formatMiB(postBytes)} <= ${formatMiB(baselineBytes)} × ${TEARDOWN_HEAP_MULTIPLE})`
			: `SCALE4 teardown assertion: failed (${formatMiB(postBytes)} > ${formatMiB(baselineBytes)} × ${TEARDOWN_HEAP_MULTIPLE})`,
	);
	const text = lines.join("\n");
	console.log(text);
	return text;
}

async function writeStepSummary(text) {
	const path = process.env.GITHUB_STEP_SUMMARY;
	if (!path) {
		return;
	}
	await appendFile(path, `\`\`\`\n${text}\n\`\`\`\n`);
}

async function run() {
	const iterations = readIterations();
	const usedGc = gcAvailable();
	if (!usedGc) {
		console.log(
			"SCALE4 soak: globalThis.gc is unavailable. Re-run with `node --expose-gc` to force GC before each sample.",
		);
	}

	await exerciseWorkloadOnce();
	sample("warmup-empty");

	const baselineBytes = await measureBaseline();

	await runSession(iterations);
	sample("session-destroyed");

	const postBytes = await measureRecreate();

	const ratio = postBytes / baselineBytes;
	const passed = postBytes <= baselineBytes * TEARDOWN_HEAP_MULTIPLE;
	const text = printReport({
		iterations,
		usedGc,
		baselineBytes,
		postBytes,
		ratio,
		passed,
	});
	await writeStepSummary(text);

	if (!passed) {
		process.exitCode = 1;
	}
}

run().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exitCode = 1;
});
