import type { DocumentOp } from "@input/pen-types";
import { expect, test, type Page } from "@playwright/test";
import { getInlineOffsetPoint, resolveBlockId } from "./domGeometry";
import {
	assertDomAuthorityResult,
	assertStandingDiagnostics,
	assertStandingDomMatchesAuthority,
} from "./standingAssertions";
import type {
	DragTextArgs,
	RemoteSpliceArgs,
	ScenarioApi,
	SelectionEqualsArgs,
} from "./types";

export function scenario(
	name: string,
	fn: (s: ScenarioApi, page: Page) => Promise<void>,
): void {
	test(name, async ({ page }) => {
		await page.goto("/");
		await expect(
			page.locator("[data-pen-inline-content]").first(),
		).toBeVisible();
		await fn(createScenario(page), page);
	});
}

function createScenario(page: Page): ScenarioApi {
	const expectedDiagnostics = new Set<string>();

	async function standing(): Promise<void> {
		await assertStandingDomMatchesAuthority(page);
		await assertStandingDiagnostics(page, expectedDiagnostics);
	}

	async function step<T>(
		run: () => Promise<T>,
		options?: { skipStanding?: boolean },
	): Promise<T> {
		const result = await run();
		if (!options?.skipStanding) {
			await standing();
		}
		return result;
	}

	return {
		async load(name: string) {
			await step(async () => {
				await page.evaluate((fixtureName) => {
					window.__penConformance.load(fixtureName);
				}, name);
				await expect(
					page.locator(`[data-fixture="${name}"]`),
				).toBeVisible();
				await expect(
					page.locator("[data-pen-inline-content]").first(),
				).toBeVisible();
				await page.locator("[data-pen-inline-content]").first().click();
			});
		},
		async apply(ops: readonly DocumentOp[]) {
			await step(async () => {
				await page.evaluate((documentOps) => {
					window.__penConformance.apply(documentOps);
				}, ops);
			});
		},
		async applyToolPayloads(payloadsJson: string) {
			return step(async () => {
				return page.evaluate((raw) => {
					return window.__penConformance.applyToolPayloads(
						JSON.parse(raw) as unknown[],
					);
				}, payloadsJson);
			});
		},
		async importHtml(html: string) {
			await step(async () => {
				await page.evaluate((source) => {
					return window.__penConformance.importHtml(source);
				}, html);
			});
		},
		async pasteHtml(html: string) {
			await step(async () => {
				await page.evaluate((source) => {
					return window.__penConformance.pasteHtml(source);
				}, html);
			});
		},
		keyboard: {
			async type(text: string) {
				await step(async () => {
					await page.keyboard.type(text);
				});
			},
		},
		mouse: {
			async dragText(args: DragTextArgs) {
				await step(async () => {
					const from = await getInlineOffsetPoint(page, args.from);
					const to = await getInlineOffsetPoint(page, args.to);
					await page.mouse.move(from.x, from.y);
					await page.mouse.down();
					await page.mouse.move(to.x, to.y);
					await page.mouse.up();
				});
			},
		},
		remote: {
			async splice(args: RemoteSpliceArgs) {
				await step(async () => {
					await page.evaluate((splice) => {
						window.__penConformance.remoteSplice(splice);
					}, args);
				});
			},
			async apply(ops: readonly DocumentOp[]) {
				await step(async () => {
					await page.evaluate((documentOps) => {
						window.__penConformance.remoteApply(documentOps);
					}, ops);
				});
			},
			async injectY(args) {
				await step(async () => {
					await page.evaluate((inject) => {
						window.__penConformance.remoteInjectY(inject);
					}, args);
				});
			},
		},
		expectDiagnostic(code) {
			expectedDiagnostics.add(code);
		},
		async installBrokenProjector() {
			await step(
				async () => {
					await page.evaluate(() => {
						window.__penConformance.installBrokenProjector();
					});
				},
				{ skipStanding: true },
			);
		},
		assert: {
			async selectionEquals(expected: SelectionEqualsArgs) {
				await step(async () => {
					const anchorBlockId = await resolveBlockId(page, expected.anchor);
					const focusBlockId = await resolveBlockId(page, expected.focus);
					const selection = await page.evaluate(
						() => window.__penConformance.selection,
					);
					expect(selection).toMatchObject({
						type: "text",
						anchor: {
							blockId: anchorBlockId,
							offset: expected.anchor.offset,
						},
						focus: {
							blockId: focusBlockId,
							offset: expected.focus.offset,
						},
					});
				});
			},
			async domMatchesAuthority() {
				const result = await page.evaluate(() =>
					window.__penConformance.domMatchesAuthority(),
				);
				assertDomAuthorityResult(result);
				await assertStandingDiagnostics(page, expectedDiagnostics);
			},
			async textContains(text: string) {
				await step(async () => {
					const documentText = await page.evaluate(
						() => window.__penConformance.documentText,
					);
					expect(documentText).toContain(text);
				});
			},
			async corpusSafe(options?: { requireBlockedUrl?: boolean }) {
				const scan = await page.evaluate(() =>
					window.__penConformance.scanHostileDom(),
				);
				expect(scan.probeTripped, "window.__xssProbe was called").toBe(false);
				expect(scan.javascriptUrls, "javascript: reached a URL attribute").toEqual(
					[],
				);
				if (options?.requireBlockedUrl) {
					expect(scan.blockedUrlCount).toBeGreaterThan(0);
				}
			},
			async xssProbeNotTripped() {
				const scan = await page.evaluate(() =>
					window.__penConformance.scanHostileDom(),
				);
				expect(scan.probeTripped, "window.__xssProbe was called").toBe(false);
			},
		},
	};
}
