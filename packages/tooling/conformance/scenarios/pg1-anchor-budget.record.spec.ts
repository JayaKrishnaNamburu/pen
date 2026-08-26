import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { scenario } from "../src/scenario";
import {
	generateTenKCells,
	generateTenKParagraphs,
	TEN_K_CELL_COLS,
	TEN_K_CELL_ROWS,
	TEN_K_CELL_WORD_COUNT,
	TEN_K_PARAGRAPH_COUNT,
	TEN_K_TABLE_ID,
	TEN_K_WORD_COUNT,
	tenKBlockId,
	tenKFixtureIdentity,
	tenKWordOps,
} from "../src/tenKWordFixture";
import { isPg1Record } from "../src/anchorBudget";

/**
 * PG1 Chromium count check on the 10k-word fixture.
 * Clocks are not asserted (CH8). A no-op mint fails encodeCount by name.
 * The 2×2 cell cohort is part of the fixture; minting 0 cells is a miss, not a budget.
 */

const SESSION_HREF = "/src/session.ts";
const MINT_COUNT = 1_000;
const ENCODE_CAP_BYTES = 256;

// Two levels, not three: this file sits in `conformance/scenarios/`, one
// directory shallower than `conformance/src/hosts/anchorBudget.test.js`, which
// reads the same baseline with three. Copying that path verbatim resolved to
// `packages/bench/baselines/` and threw ENOENT on the first run.
const BASELINE_PATH = fileURLToPath(
	new URL(
		"../../bench/baselines/v3-anchor-budget.chromium.json",
		import.meta.url,
	),
);

scenario(
	"PG1: Chromium mint/resolve counts on the 10k-word fixture",
	async (s, page) => {
		test.skip(
			test.info().project.name !== "chromium",
			"PG1 records Chromium only; WebKit/Firefox are a separate failure surface",
		);
		test.setTimeout(120_000);

		const raw = readFileSync(BASELINE_PATH, "utf8");
		const baseline: unknown = JSON.parse(raw);
		expect(
			isPg1Record(baseline),
			"PG1_BASELINE_MISSING or not a PG1 record",
		).toBe(true);
		if (!isPg1Record(baseline)) {
			return;
		}

		const paragraphs = generateTenKParagraphs();
		const cells = generateTenKCells();
		const fixture = tenKFixtureIdentity(paragraphs, cells);
		expect(fixture.wordCount - fixture.cellWordCount).toBe(
			TEN_K_WORD_COUNT,
		);
		expect(fixture.cellWordCount).toBe(TEN_K_CELL_WORD_COUNT);
		expect(fixture.contentSha256, "PG1_FIXTURE_HASH").toBe(
			baseline.fixture.contentSha256,
		);
		expect(fixture.paragraphSha256).toBe(baseline.fixture.paragraphSha256);

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
		await expect(
			page.locator(`[data-block-id="${TEN_K_TABLE_ID}"]`),
		).toBeVisible();

		const measured = await page.evaluate(
			async ({ sessionHref, mintCount, tableId, firstId }) => {
				const { getHarnessSession } = (await import(sessionHref)) as {
					getHarnessSession: () => {
						editor: {
							anchors: {
								create: (
									target: {
										blockId: string;
										offset: number;
										cell?: { row: number; col: number };
									},
									assoc?: -1 | 1,
								) => { position: Uint8Array } | null;
								resolve: (anchor: { position: Uint8Array }) => {
									blockId: string;
									offset: number;
								} | null;
							};
							documentState: { blockOrder: readonly string[] };
							getBlock: (id: string) => {
								type: string;
								as: (kind: "table") => {
									tableRowCount: () => number;
									tableColumnCount: () => number;
									tableCell: (
										row: number,
										col: number,
									) => { textContent: () => string } | null;
								} | null;
							} | null;
						};
					};
				};
				const editor = getHarnessSession().editor;
				const snapshot = window.__penConformance.documentSnapshot();
				const firstBlock = snapshot.blocks.find(
					(block) => block.id === firstId,
				);
				if (!firstBlock) {
					throw new Error(
						"PG1: first paragraph missing after 10k apply",
					);
				}
				const textLength = firstBlock.text.length;
				const minted: Array<{ position: Uint8Array }> = [];
				for (let i = 0; i < mintCount; i++) {
					const offset = Math.floor((i / mintCount) * textLength);
					const anchor = editor.anchors.create(
						{ blockId: firstId, offset },
						1,
					);
					if (anchor) {
						minted.push(anchor);
					}
				}
				let resolveCount = 0;
				let nullCount = 0;
				for (const anchor of minted) {
					const resolved = editor.anchors.resolve(anchor);
					if (resolved == null) {
						nullCount += 1;
					} else {
						resolveCount += 1;
					}
				}
				const sizes = minted.map(
					(anchor) => anchor.position.byteLength,
				);
				sizes.sort((a, b) => a - b);
				const cellMinted: Array<{ position: Uint8Array }> = [];
				for (const cell of [
					{ row: 0, col: 0 },
					{ row: 0, col: 1 },
					{ row: 1, col: 0 },
					{ row: 1, col: 1 },
				]) {
					const anchor = editor.anchors.create(
						{ blockId: tableId, offset: 0, cell },
						1,
					);
					if (anchor) {
						cellMinted.push(anchor);
					}
				}
				let cellResolveCount = 0;
				for (const anchor of cellMinted) {
					if (editor.anchors.resolve(anchor) != null) {
						cellResolveCount += 1;
					}
				}
				const tableHandle = editor.getBlock(tableId);
				const table = tableHandle?.as("table");
				return {
					encodeCount: minted.length,
					resolveCount,
					nullCount,
					minBytes: sizes[0] ?? 0,
					maxBytes: sizes[sizes.length - 1] ?? 0,
					cellMintCount: cellMinted.length,
					cellResolveCount,
					blockCount: editor.documentState.blockOrder.length,
					tableType: tableHandle?.type ?? null,
					tableRowCount: table?.tableRowCount() ?? null,
					tableColumnCount: table?.tableColumnCount() ?? null,
					cell00Chars: table?.tableCell(0, 0)?.textContent().length ?? 0,
					orderHasTable: editor.documentState.blockOrder.includes(tableId),
				};
			},
			{
				sessionHref: SESSION_HREF,
				mintCount: MINT_COUNT,
				tableId: TEN_K_TABLE_ID,
				firstId: first.id,
			},
		);

		expect(measured.encodeCount, "PG1 encodeCount").toBe(MINT_COUNT);
		expect(measured.resolveCount, "PG1 resolveCount").toBe(MINT_COUNT);
		expect(measured.nullCount, "PG1 nullCount").toBe(0);
		expect(measured.maxBytes, "PG1 encode cap").toBeLessThanOrEqual(
			ENCODE_CAP_BYTES,
		);
		expect(measured.minBytes, "PG1 encode min").toBeGreaterThan(0);
		expect(measured.orderHasTable, "PG1 table in blockOrder").toBe(true);
		expect(measured.tableType, "PG1 table type").toBe("table");
		expect(measured.tableRowCount, "PG1 table rows").toBe(TEN_K_CELL_ROWS);
		expect(measured.tableColumnCount, "PG1 table cols").toBe(TEN_K_CELL_COLS);
		expect(measured.cell00Chars, "PG1 cell text").toBeGreaterThan(0);
		expect(measured.cellMintCount, "PG1 cell cohort").toBe(
			TEN_K_CELL_ROWS * TEN_K_CELL_COLS,
		);
		expect(measured.cellResolveCount, "PG1 cell resolve").toBe(
			TEN_K_CELL_ROWS * TEN_K_CELL_COLS,
		);
		expect(measured.blockCount).toBeGreaterThanOrEqual(
			TEN_K_PARAGRAPH_COUNT,
		);
	},
	{ axe: false },
);
