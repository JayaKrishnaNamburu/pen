import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { documentOpsExtension } from "@input/pen-document-ops";
import { defaultSchema } from "@input/pen-schema-default";
import { undoExtension } from "@input/pen-undo";
import type { Editor, ModelAdapter, ModelStreamEvent } from "@input/pen-types";
import { aiExtension, getAIController } from "../index";
import { deltaStreamExtension } from "../stream";
import type { GenerationState } from "../types";
import {
	EDIT_CHANNEL_CORPUS,
	type EditChannelCorpusMetrics,
	type EditChannelCorpusSeed,
	seedEditChannelCorpus,
} from "./fixtures/editChannelCorpus";
import {
	OFF_CONTRACT_OUTPUT,
	OFF_CONTRACT_PROMPT,
	annotationsFromRequest,
	buildToolOperations,
	isBenchSkip,
	type CorpusPromptId,
} from "./fixtures/editChannelBenchDoubles";

/**
 * GATE 0.14 harness, now running the remaining `edit_document` channel.
 * Spec: `spec-better-ai/waves/wave-0-prototype.md` Step 0.7.
 */

export type BenchChannel = "tool";

export interface BenchRow extends EditChannelCorpusMetrics {
	promptId: string;
	channel: BenchChannel;
	prompt: string;
	knownWeak?: boolean;
	wallMs: number;
	firstFeedbackMs: number | null;
	documentChanged: boolean;
	postconditionReason: string | null;
	skipReason?: string;
}

export interface BenchReport {
	generatedAt: string;
	mutationPreference: "direct";
	rows: BenchRow[];
}

const CHANNELS: readonly BenchChannel[] = ["tool"];

function snapshotDocument(editor: Editor): string {
	return Array.from(editor.blocks())
		.map((block) => `${block.id}:${block.type}:${block.textContent()}`)
		.join("|");
}

function originType(origin: { type?: string } | string | undefined): string {
	if (typeof origin === "string") {
		return origin;
	}
	return origin?.type ?? "";
}

function countRefusals(generation: GenerationState): number {
	let refusals = 0;
	for (const step of generation.steps) {
		if (step.type !== "tool-result") {
			continue;
		}
		if (step.status === "error") {
			refusals += 1;
			continue;
		}
		const output = step.output;
		if (output && typeof output === "object") {
			const record = output as {
				ok?: unknown;
				rejected?: unknown;
			};
			if (record.ok === false) {
				refusals += 1;
			}
			if (Array.isArray(record.rejected)) {
				refusals += record.rejected.length;
			}
		}
	}
	return refusals;
}

function countToolCalls(generation: GenerationState): number {
	return generation.steps.filter((step) => step.type === "tool-call").length;
}

function countOutputChars(generation: GenerationState): number {
	let chars = generation.text.length;
	for (const step of generation.steps) {
		if (step.type === "tool-call") {
			chars += JSON.stringify(step.input ?? "").length;
		}
	}
	return chars;
}

function firstFeedbackMs(
	generation: GenerationState,
	wallMs: number,
	firstDocumentChangeMs: number | null,
): number | null {
	const debug = generation.debug;
	const candidates = [
		firstDocumentChangeMs,
		debug?.firstVisibleTextMs ?? null,
		debug?.firstToolResultMs ?? null,
	].filter((value): value is number => value != null && Number.isFinite(value));
	if (candidates.length === 0) {
		return wallMs > 0 ? wallMs : null;
	}
	return Math.min(...candidates);
}

function createChatEditor(model: ModelAdapter): Editor {
	return createEditor({
		schema: defaultSchema,
		extensions: [
			undoExtension(),
			deltaStreamExtension(),
			documentOpsExtension(),
			aiExtension({
				model,
				contentFormat: { blockGeneration: "markdown" },
				mutationPreference: "direct",
				allowedMutatingTools: ["edit_document"],
			}),
		],
	});
}

function toolChannelModel(
	promptId: CorpusPromptId,
	seedRef: { current: EditChannelCorpusSeed },
): {
	adapter: ModelAdapter;
	passes: () => number;
	skipReason: () => string | undefined;
} {
	let passes = 0;
	let skipReason: string | undefined;
	const adapter: ModelAdapter = {
		async *stream(request) {
			passes += 1;
			if (passes > 1) {
				yield { type: "done" } as ModelStreamEvent;
				return;
			}
			const operations = buildToolOperations(
				promptId,
				annotationsFromRequest(request),
				seedRef.current,
			);
			if (isBenchSkip(operations)) {
				skipReason = operations.reason;
				yield { type: "done" } as ModelStreamEvent;
				return;
			}
			yield {
				type: "tool-call",
				toolCallId: `call-${passes}`,
				toolName: "edit_document",
				input: { operations },
			} as ModelStreamEvent;
			yield { type: "done" } as ModelStreamEvent;
		},
	};
	return {
		adapter,
		passes: () => passes,
		skipReason: () => skipReason,
	};
}

function proseModel(): { adapter: ModelAdapter; passes: () => number } {
	let passes = 0;
	const adapter: ModelAdapter = {
		async *stream() {
			passes += 1;
			yield { type: "text-delta", delta: OFF_CONTRACT_OUTPUT } as ModelStreamEvent;
			yield { type: "done" } as ModelStreamEvent;
		},
	};
	return { adapter, passes: () => passes };
}

async function runOnce(options: {
	channel: BenchChannel;
	promptId: string;
	prompt: string;
	knownWeak?: boolean;
	kind: "corpus" | "off-contract";
	corpusId?: CorpusPromptId;
}): Promise<BenchRow> {
	const seedRef: { current: EditChannelCorpusSeed } = {
		current: undefined as unknown as EditChannelCorpusSeed,
	};
	const model =
		options.kind === "off-contract"
			? proseModel()
			: toolChannelModel(options.corpusId!, seedRef);

	const editor = createChatEditor(model.adapter);
	await editor.whenReady();
	const seed: EditChannelCorpusSeed = seedEditChannelCorpus(editor);
	seedRef.current = seed;
	const before = snapshotDocument(editor);

	let firstDocumentChangeMs: number | null = null;
	const started = performance.now();
	const unsubscribe = editor.on("commit", (event) => {
		if (originType(event.origin) === "system") {
			return;
		}
		if (firstDocumentChangeMs == null) {
			firstDocumentChangeMs = performance.now() - started;
		}
	});

	const generation = await getAIController(editor)!.runPrompt(options.prompt, {
		target: "document",
	});
	const wallMs = performance.now() - started;
	unsubscribe();

	const after = snapshotDocument(editor);
	const documentChanged = after !== before;
	const corpusEntry = EDIT_CHANNEL_CORPUS.find(
		(entry) => entry.id === options.promptId,
	);
	const postconditionReason =
		options.kind === "off-contract"
			? EDIT_CHANNEL_CORPUS[0]!.postcondition(editor, seed)
			: corpusEntry!.postcondition(editor, seed);
	const postconditionMet = postconditionReason == null;
	// Either channel can decline a prompt its operation set cannot express.
	const skipReason =
		options.kind === "corpus"
			? (model as ReturnType<typeof toolChannelModel>).skipReason?.()
			: undefined;

	const row: BenchRow = {
		promptId: options.promptId,
		channel: options.channel,
		prompt: options.prompt,
		knownWeak: options.knownWeak,
		postconditionMet,
		modelPasses: model.passes(),
		toolCalls: countToolCalls(generation),
		refusals: countRefusals(generation),
		outputChars: countOutputChars(generation),
		wrongEdit: documentChanged && !postconditionMet,
		wallMs,
		firstFeedbackMs: firstFeedbackMs(
			generation,
			wallMs,
			firstDocumentChangeMs,
		),
		documentChanged,
		postconditionReason,
		skipReason,
	};

	editor.destroy();
	return row;
}

function writeReportIfRequested(report: BenchReport): void {
	const outPath = process.env.EDIT_CHANNEL_BENCH_OUT;
	if (!outPath) {
		return;
	}
	mkdirSync(path.dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

describe("edit channel corpus bench (GATE 0.14)", () => {
	it(
		"runs the tool channel on the full corpus plus the off-contract control",
		{ timeout: 60_000 },
		async () => {
		const rows: BenchRow[] = [];

		for (const channel of CHANNELS) {
			for (const entry of EDIT_CHANNEL_CORPUS) {
				rows.push(
					await runOnce({
						channel,
						promptId: entry.id,
						prompt: entry.prompt,
						knownWeak: entry.knownWeak,
						kind: "corpus",
						corpusId: entry.id,
					}),
				);
			}
			rows.push(
				await runOnce({
					channel,
					promptId: "off-contract",
					prompt: OFF_CONTRACT_PROMPT,
					kind: "off-contract",
				}),
			);
		}

		const report: BenchReport = {
			generatedAt: new Date().toISOString(),
			mutationPreference: "direct",
			rows,
		};
		writeReportIfRequested(report);

		const toolCorpus = rows.filter(
			(row) => row.channel === "tool" && row.promptId !== "off-contract",
		);
		expect(toolCorpus.map((row) => row.promptId)).toEqual(
			EDIT_CHANNEL_CORPUS.map((entry) => entry.id),
		);
		expect(toolCorpus.some((row) => row.promptId === "p9" && row.knownWeak)).toBe(
			true,
		);

		const toolControl = rows.find(
			(row) => row.channel === "tool" && row.promptId === "off-contract",
		)!;
		expect(toolControl.documentChanged).toBe(false);
		expect(toolControl.wrongEdit).toBe(false);

		if (process.env.EDIT_CHANNEL_BENCH_OUT) {
			expect(existsSync(process.env.EDIT_CHANNEL_BENCH_OUT)).toBe(true);
		}
		},
	);
});
