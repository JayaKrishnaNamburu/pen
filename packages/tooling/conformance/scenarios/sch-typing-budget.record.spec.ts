import {
	appendFileSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { scenario } from "../src/scenario";
import {
	generateTenKParagraphs,
	TEN_K_FIXTURE_ID,
	TEN_K_GENERATOR,
	TEN_K_PARAGRAPH_COUNT,
	TEN_K_WORD_COUNT,
	tenKBlockId,
	tenKFixtureIdentity,
	tenKWordOps,
} from "../src/tenKWordFixture";
import {
	formatDriftReport,
	summarizeTypingBudget,
	type TypingBudgetSummary,
} from "../src/typingBudget";

/**
 * Wave 3.5 — record, do not enforce.
 *
 * This file is named `.record.` so it is not mistaken for coverage. It
 * measures the spec's typing budgets on Chromium and writes a committed
 * baseline. It does not assert the numbers. A later run that moves a
 * count is loud in stdout / the job summary; a 5% p95 move is quiet and
 * produces no git diff unless someone re-records (`RECORD_TYPING_BUDGET=1`).
 */

const SESSION_HREF = "/src/session.ts";
const GEOMETRY_HREF = "/src/geometry.ts";

const BASELINE_PATH = fileURLToPath(
	new URL("../baselines/wave3-typing-budget.chromium.json", import.meta.url),
);
const LAST_RUN_PATH = fileURLToPath(
	new URL(
		"../test-results/wave3-typing-budget.chromium.json",
		import.meta.url,
	),
);

const SPEC_BUDGETS = {
	readPhaseP95Ms: 2,
	writePhaseP95Ms: 2,
	measureNowPerKeystroke: 1,
	flushesPerFrame: 1,
} as const;

const UNWIRED_TEXT = "probe";
const WARMUP_TEXT = "warm";
const STEADY_TEXT = "pack my box with five dozen.";
const KEY_DELAY_MS = 17;
const CPS = 60;

const SCHEMA_VERSION = 1;

type FlushSample = {
	frameTime: number;
	readMs: number;
	writeMs: number;
	measureNowCount: number;
};

type UnwiredObservation = {
	keystrokes: number;
	flushCount: number;
	measureNowCount: number;
};

type FedObservation = {
	readPhaseMs: number[];
	writePhaseMs: number[];
	measureNowPerKeystroke: number[];
	flushesPerFrame: number[];
	flushCount: number;
	keystrokeCount: number;
	measureNowTotal: number;
};

type TypingBudgetDocument = {
	schemaVersion: number;
	recordedAt: string;
	specBudgets: typeof SPEC_BUDGETS;
	fixture: {
		id: string;
		generator: string;
		algorithm: string;
		seed: number;
		seedHex: string;
		lexiconSize: number;
		wordCount: number;
		paragraphCount: number;
		contentSha256: string;
	};
	environment: {
		browser: string;
		browserVersion: string;
		userAgent: string;
		platform: string;
		arch: string;
		node: string;
		viewport: { width: number; height: number } | null;
		deviceScaleFactor: number;
	};
	protocol: {
		cps: number;
		keyDelayMs: number;
		steadyText: string;
		warmupText: string;
		unwiredText: string;
		wiring: string;
		queuedWork: string;
		unwired: UnwiredObservation;
	};
	samples: {
		readPhaseMs: number[];
		writePhaseMs: number[];
		measureNowPerKeystroke: number[];
		flushesPerFrame: number[];
	};
	summary: TypingBudgetSummary;
	versusSpec: {
		readPhaseP95Ms: {
			budget: number;
			measured: number | null;
			blown: boolean;
		};
		writePhaseP95Ms: {
			budget: number;
			measured: number | null;
			blown: boolean;
		};
		measureNowPerKeystroke: {
			budget: number;
			measured: number | null;
			blown: boolean;
		};
		flushesPerFrame: {
			budget: number;
			measured: number | null;
			blown: boolean;
		};
	};
};

type ProbeApi = {
	install(): Promise<{
		flushIsFunction: boolean;
		phaseFieldPatched: boolean;
	}>;
	startUnwired(): void;
	endUnwired(): UnwiredObservation;
	startFed(): void;
	markSteady(): void;
	markKeystroke(): { measureNow: number; flushCount: number };
	collectKeystroke(before: { measureNow: number; flushCount: number }): void;
	waitFrames(count: number): Promise<void>;
	endFed(): FedObservation;
};

declare global {
	interface Window {
		__typingBudget?: ProbeApi;
	}
}

function readBaseline(): TypingBudgetDocument | null {
	try {
		return JSON.parse(
			readFileSync(BASELINE_PATH, "utf8"),
		) as TypingBudgetDocument;
	} catch {
		return null;
	}
}

function writeJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`, "utf8");
}

function roundMs(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function versusSpec(summary: TypingBudgetSummary) {
	const read = summary.readPhaseP95Ms;
	const write = summary.writePhaseP95Ms;
	const measureNow = summary.measureNowPerKeystrokeMax;
	const flushes = summary.flushesPerFrameMax;
	return {
		readPhaseP95Ms: {
			budget: SPEC_BUDGETS.readPhaseP95Ms,
			measured: read,
			blown: read != null && read > SPEC_BUDGETS.readPhaseP95Ms,
		},
		writePhaseP95Ms: {
			budget: SPEC_BUDGETS.writePhaseP95Ms,
			measured: write,
			blown: write != null && write > SPEC_BUDGETS.writePhaseP95Ms,
		},
		measureNowPerKeystroke: {
			budget: SPEC_BUDGETS.measureNowPerKeystroke,
			measured: measureNow,
			blown:
				measureNow != null &&
				measureNow > SPEC_BUDGETS.measureNowPerKeystroke,
		},
		flushesPerFrame: {
			budget: SPEC_BUDGETS.flushesPerFrame,
			measured: flushes,
			blown: flushes != null && flushes > SPEC_BUDGETS.flushesPerFrame,
		},
	};
}

async function installProbe(page: Page): Promise<void> {
	const installed = await page.evaluate(
		async ({ sessionHref, geometryHref, unwiredKeystrokes }) => {
			const { getHarnessSession } = (await import(sessionHref)) as {
				getHarnessSession: () => {
					editor: import("@input/pen-types").Editor;
				};
			};
			const { ensureGeometry } = (await import(geometryHref)) as {
				ensureGeometry: (editor: import("@input/pen-types").Editor) => {
					scheduler: {
						phase: string;
						diagnostics: { measureNowCount: number };
						acceptCommit: (event: unknown) => void;
						read: <T>(fn: () => T) => Promise<T>;
						write: (fn: () => void) => Promise<void>;
						flush?: () => void;
					};
					reader: {
						generation: number;
						caretRect: (
							point: { blockId: string; offset: number },
							affinity: "upstream" | "downstream",
						) => {
							x: number;
							y: number;
							width: number;
							height: number;
						} | null;
					};
					overlay: {
						applyPaintPlan: (plan: {
							generation: number;
							items: readonly {
								id: string;
								kind: "caret";
								x: number;
								y: number;
								width: number;
								height: number;
							}[];
						}) => void;
					};
				};
			};

			const session = getHarnessSession();
			const host = ensureGeometry(session.editor);
			const scheduler = host.scheduler;
			const flushIsFunction = typeof scheduler.flush === "function";

			let lastRafTime = 0;
			const nativeRaf = globalThis.requestAnimationFrame.bind(globalThis);
			globalThis.requestAnimationFrame = (callback) => {
				return nativeRaf((time) => {
					lastRafTime = time;
					callback(time);
				});
			};

			const flushSamples: FlushSample[] = [];
			let current: {
				frameTime: number;
				readStart: number;
				readMs?: number;
				writeStart?: number;
			} | null = null;
			let phase = scheduler.phase;
			let phaseFieldPatched = false;
			try {
				Object.defineProperty(scheduler, "_phase", {
					configurable: true,
					get() {
						return phase;
					},
					set(next: string) {
						const now = performance.now();
						if (phase === "idle" && next === "read") {
							current = {
								frameTime: lastRafTime,
								readStart: now,
							};
						} else if (
							phase === "read" &&
							next === "write" &&
							current
						) {
							current.readMs = now - current.readStart;
							current.writeStart = now;
						} else if (
							phase === "write" &&
							next === "idle" &&
							current
						) {
							const readMs = current.readMs ?? 0;
							const writeMs =
								current.writeStart == null
									? 0
									: now - current.writeStart;
							flushSamples.push({
								frameTime: current.frameTime,
								readMs,
								writeMs,
								measureNowCount:
									scheduler.diagnostics.measureNowCount,
							});
							current = null;
						}
						phase = next;
					},
				});
				phaseFieldPatched = true;
			} catch {
				phaseFieldPatched = false;
			}

			if (flushIsFunction) {
				const originalFlush = scheduler.flush!.bind(scheduler);
				scheduler.flush = function instrumentedFlush() {
					return originalFlush();
				};
			}

			let feeding = false;
			session.editor.on("commit", (event) => {
				if (!feeding) {
					return;
				}
				scheduler.acceptCommit(event);
				const selection = session.editor.selection;
				let plan: {
					generation: number;
					items: {
						id: string;
						kind: "caret";
						x: number;
						y: number;
						width: number;
						height: number;
					}[];
				} = { generation: host.reader.generation, items: [] };
				void scheduler.read(() => {
					if (selection && selection.type === "text") {
						const rect = host.reader.caretRect(
							selection.focus,
							"downstream",
						);
						plan = {
							generation: host.reader.generation,
							items: rect
								? [
										{
											id: "local-caret",
											kind: "caret",
											x: rect.x,
											y: rect.y,
											width: rect.width,
											height: rect.height,
										},
									]
								: [],
						};
					}
				});
				void scheduler.write(() => {
					host.overlay.applyPaintPlan(plan);
				});
			});

			let unwiredStartFlush = 0;
			let unwiredStartMeasure = 0;
			let fedStartFlush = 0;
			let fedStartMeasure = 0;
			const measureNowPerKeystroke: number[] = [];

			window.__typingBudget = {
				async install() {
					return { flushIsFunction, phaseFieldPatched };
				},
				startUnwired() {
					unwiredStartFlush = flushSamples.length;
					unwiredStartMeasure = scheduler.diagnostics.measureNowCount;
				},
				endUnwired() {
					return {
						keystrokes: unwiredKeystrokes,
						flushCount: flushSamples.length - unwiredStartFlush,
						measureNowCount:
							scheduler.diagnostics.measureNowCount -
							unwiredStartMeasure,
					};
				},
				startFed() {
					feeding = true;
					fedStartFlush = flushSamples.length;
					fedStartMeasure = scheduler.diagnostics.measureNowCount;
					measureNowPerKeystroke.length = 0;
				},
				markSteady() {
					fedStartFlush = flushSamples.length;
					fedStartMeasure = scheduler.diagnostics.measureNowCount;
					measureNowPerKeystroke.length = 0;
				},
				markKeystroke() {
					return {
						measureNow: scheduler.diagnostics.measureNowCount,
						flushCount: flushSamples.length,
					};
				},
				collectKeystroke(before) {
					measureNowPerKeystroke.push(
						scheduler.diagnostics.measureNowCount -
							before.measureNow,
					);
				},
				waitFrames(count) {
					return new Promise((resolve) => {
						const step = (left: number) => {
							if (left <= 0) {
								resolve();
								return;
							}
							requestAnimationFrame(() => step(left - 1));
						};
						step(count);
					});
				},
				endFed() {
					feeding = false;
					const samples = flushSamples.slice(fedStartFlush);
					const byFrame = new Map<number, number>();
					for (const sample of samples) {
						byFrame.set(
							sample.frameTime,
							(byFrame.get(sample.frameTime) ?? 0) + 1,
						);
					}
					return {
						readPhaseMs: samples.map((sample) => sample.readMs),
						writePhaseMs: samples.map((sample) => sample.writeMs),
						measureNowPerKeystroke: [...measureNowPerKeystroke],
						flushesPerFrame: [...byFrame.values()],
						flushCount: samples.length,
						keystrokeCount: measureNowPerKeystroke.length,
						measureNowTotal:
							scheduler.diagnostics.measureNowCount -
							fedStartMeasure,
					};
				},
			};

			return { flushIsFunction, phaseFieldPatched };
		},
		{
			sessionHref: SESSION_HREF,
			geometryHref: GEOMETRY_HREF,
			unwiredKeystrokes: UNWIRED_TEXT.length,
		},
	);

	expect(
		installed.flushIsFunction,
		"DomScheduler.flush must be wrappable to count flushes",
	).toBe(true);
	expect(
		installed.phaseFieldPatched,
		"DomScheduler._phase must be patchable to time read/write phases",
	).toBe(true);
}

async function typeAndCollect(
	page: Page,
	text: string,
	collect: boolean,
): Promise<void> {
	for (const character of text) {
		const before = collect
			? await page.evaluate(() => window.__typingBudget!.markKeystroke())
			: null;
		await page.keyboard.type(character, { delay: KEY_DELAY_MS });
		await page.evaluate(async () => {
			await window.__typingBudget!.waitFrames(2);
		});
		if (before && collect) {
			await page.evaluate(
				(mark) => window.__typingBudget!.collectKeystroke(mark),
				before,
			);
		}
	}
}

scenario(
	"record (not assert) typing-budget baseline on the 10k-word fixture",
	async (s, page) => {
		test.skip(
			test.info().project.name !== "chromium",
			"Wave 3.5 records Chromium only; WebKit/Firefox are a separate failure surface",
		);
		test.setTimeout(120_000);

		const paragraphs = generateTenKParagraphs();
		const fixture = tenKFixtureIdentity(paragraphs);
		expect(
			fixture.wordCount,
			"10k-word fixture must be exactly 10000 words",
		).toBe(TEN_K_WORD_COUNT);

		await s.load("hello-world");
		const first = await page.evaluate(() => {
			const snapshot = window.__penConformance.documentSnapshot();
			const block = snapshot.blocks[0];
			if (!block) {
				throw new Error("hello-world has no first block");
			}
			return { id: block.id, length: block.text.length };
		});
		await page.evaluate(
			(ops) => {
				window.__penConformance.apply(ops);
			},
			tenKWordOps(first.id, first.length),
		);
		const lastBlockId = tenKBlockId(TEN_K_PARAGRAPH_COUNT - 1);
		await expect(
			page.locator(`[data-block-id="${lastBlockId}"]`),
		).toBeVisible();

		const wordCount = await page.evaluate(() => {
			return window.__penConformance.documentText
				.split(/\s+/)
				.filter((word) => word.length > 0).length;
		});
		expect(
			wordCount,
			"mounted document must keep the 10k-word fixture",
		).toBe(TEN_K_WORD_COUNT);

		await page
			.locator(
				`[data-block-id="${lastBlockId}"] [data-pen-inline-content]`,
			)
			.click();

		await installProbe(page);
		await page.evaluate(() => window.__typingBudget!.startUnwired());
		await typeAndCollect(page, UNWIRED_TEXT, false);
		const unwired = await page.evaluate(() =>
			window.__typingBudget!.endUnwired(),
		);

		await page.evaluate(() => window.__typingBudget!.startFed());
		await typeAndCollect(page, WARMUP_TEXT, false);
		await page.evaluate(() => window.__typingBudget!.markSteady());
		await typeAndCollect(page, STEADY_TEXT, true);
		await page.evaluate(async () => {
			await window.__typingBudget!.waitFrames(2);
		});
		const fed = await page.evaluate(() => window.__typingBudget!.endFed());

		expect(
			fed.keystrokeCount,
			"steady-state window must record one sample per typed character",
		).toBe(STEADY_TEXT.length);
		expect(
			fed.flushCount,
			"steady-state should flush once per keystroke at 60cps (protocol, not a budget gate)",
		).toBe(STEADY_TEXT.length);

		const readPhaseMs = fed.readPhaseMs.map(roundMs);
		const writePhaseMs = fed.writePhaseMs.map(roundMs);
		const summary = summarizeTypingBudget({
			readPhaseMs,
			writePhaseMs,
			measureNowPerKeystroke: fed.measureNowPerKeystroke,
			flushesPerFrame: fed.flushesPerFrame,
			flushCount: fed.flushCount,
			keystrokeCount: fed.keystrokeCount,
		});

		const browser = page.context().browser();
		const document: TypingBudgetDocument = {
			schemaVersion: SCHEMA_VERSION,
			recordedAt: new Date().toISOString(),
			specBudgets: SPEC_BUDGETS,
			fixture: {
				id: TEN_K_FIXTURE_ID,
				generator:
					"packages/tooling/conformance/src/tenKWordFixture.ts",
				algorithm: TEN_K_GENERATOR.algorithm,
				seed: TEN_K_GENERATOR.seed,
				seedHex: `0x${TEN_K_GENERATOR.seed.toString(16)}`,
				lexiconSize: TEN_K_GENERATOR.lexicon.length,
				wordCount: fixture.wordCount,
				paragraphCount: fixture.paragraphCount,
				contentSha256: fixture.contentSha256,
			},
			environment: {
				browser: "chromium",
				browserVersion: browser?.version() ?? "unknown",
				userAgent: await page.evaluate(() => navigator.userAgent),
				platform: process.platform,
				arch: process.arch,
				node: process.version,
				viewport: page.viewportSize(),
				deviceScaleFactor: 1,
			},
			protocol: {
				cps: CPS,
				keyDelayMs: KEY_DELAY_MS,
				steadyText: STEADY_TEXT,
				warmupText: WARMUP_TEXT,
				unwiredText: UNWIRED_TEXT,
				wiring: "harness-fed commits only: editor.on('commit') → acceptCommit. DomScheduler is not on the production apply path (Wave 2 still open). Unwired observation is the real typing path today.",
				queuedWork:
					"one caretRect read of the live text focus and applyPaintPlan of that caret, queued per commit — the OV1 single-caret flush, not a synthetic scheduler loop",
				unwired,
			},
			samples: {
				readPhaseMs,
				writePhaseMs,
				measureNowPerKeystroke: fed.measureNowPerKeystroke,
				flushesPerFrame: fed.flushesPerFrame,
			},
			summary,
			versusSpec: versusSpec(summary),
		};

		writeJson(LAST_RUN_PATH, document);

		const recording = process.env.RECORD_TYPING_BUDGET === "1";
		const baseline = readBaseline();
		if (recording) {
			writeJson(BASELINE_PATH, document);
		} else if (!baseline) {
			expect(
				baseline,
				`missing ${BASELINE_PATH}; run pnpm --filter @input/pen-conformance run record:typing-budget`,
			).not.toBeNull();
			return;
		} else {
			expect(
				fixture.contentSha256,
				"fixture generator changed — re-record the baseline (RECORD_TYPING_BUDGET=1) so a number move is not blamed on the document",
			).toBe(baseline.fixture.contentSha256);
			expect(baseline.schemaVersion, "baseline schemaVersion").toBe(
				SCHEMA_VERSION,
			);
		}

		const compareTo = recording
			? document
			: (baseline as TypingBudgetDocument);
		const drift = formatDriftReport(compareTo, document);
		console.log(`\n${drift.text}\n`);
		test.info().annotations.push({
			type: "typing-budget-drift",
			description: drift.text,
		});
		await test.info().attach("typing-budget-drift", {
			body: drift.text,
			contentType: "text/plain",
		});
		const summaryPath = process.env.GITHUB_STEP_SUMMARY;
		if (summaryPath) {
			appendFileSync(
				summaryPath,
				`\n## Typing budget (record-only)\n\n\`\`\`\n${drift.text}\n\`\`\`\n`,
			);
		}

		await s.assert.textContains(STEADY_TEXT);
	},
	{ axe: false },
);
