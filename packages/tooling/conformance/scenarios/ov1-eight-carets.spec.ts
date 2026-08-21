import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { scenario } from "../src/scenario";
import type { GeometryEightCaretItem, GeometryPoint } from "../src/types";
import { REMOTE_CARET_COUNT } from "../src/wave3Geometry";

type ChromeMetric = { name: string; value: number };

type PaintedCaret = {
	kind: string | null;
	transform: string;
	styleLeft: string;
	styleTop: string;
	styleWidth: string;
	styleHeight: string;
	box: { x: number; y: number; width: number; height: number };
};

async function chromiumLayoutCount(page: Page): Promise<{
	read(): Promise<number>;
} | null> {
	if (test.info().project.name !== "chromium") {
		return null;
	}
	const session: CDPSession = await page.context().newCDPSession(page);
	await session.send("Performance.enable");
	return {
		async read() {
			const { metrics } = (await session.send("Performance.getMetrics")) as {
				metrics: ChromeMetric[];
			};
			const layout = metrics.find((metric) => metric.name === "LayoutCount");
			if (!layout) {
				throw new Error(
					`Performance.getMetrics missing LayoutCount: ${metrics
						.map((metric) => metric.name)
						.join(",")}`,
				);
			}
			return layout.value;
		},
	};
}

async function paintedCarets(page: Page): Promise<PaintedCaret[]> {
	return page.evaluate(() => {
		const layer = document.querySelector("[data-pen-overlay-layer]");
		if (!(layer instanceof HTMLElement)) {
			return [];
		}
		return [...layer.querySelectorAll("[data-pen-overlay-item]")].map((node) => {
			const item = node as HTMLElement;
			const box = item.getBoundingClientRect();
			return {
				kind: item.getAttribute("data-pen-overlay-item"),
				transform: item.style.transform,
				styleLeft: item.style.left,
				styleTop: item.style.top,
				styleWidth: item.style.width,
				styleHeight: item.style.height,
				box: {
					x: box.x,
					y: box.y,
					width: box.width,
					height: box.height,
				},
			};
		});
	});
}

function parseTranslate3d(transform: string): { x: number; y: number } {
	const match = /translate3d\(\s*([-\d.]+)px,\s*([-\d.]+)px/.exec(transform);
	if (!match) {
		throw new Error(`expected translate3d paint, got ${transform}`);
	}
	return { x: Number(match[1]), y: Number(match[2]) };
}

function assertPaintedMatchesPlan(
	items: readonly GeometryEightCaretItem[],
	painted: readonly PaintedCaret[],
): void {
	expect(painted).toHaveLength(items.length);
	for (let index = 0; index < items.length; index += 1) {
		const item = items[index]!;
		const node = painted[index]!;
		const translate = parseTranslate3d(node.transform);
		expect(node.kind).toBe("caret");
		expect(node.styleLeft).toBe("0px");
		expect(node.styleTop).toBe("0px");
		expect(node.styleWidth).toBe(`${item.width}px`);
		expect(node.styleHeight).toBe(`${item.height}px`);
		expect(translate.x).toBeCloseTo(item.x, 4);
		expect(translate.y).toBeCloseTo(item.y, 4);
		expect(node.box.x).toBeCloseTo(item.x, 4);
		expect(node.box.y).toBeCloseTo(item.y, 4);
		expect(node.box.width).toBeCloseTo(item.width, 4);
		expect(node.box.height).toBeCloseTo(item.height, 4);
	}
}

async function forceExtraLayoutPass(page: Page): Promise<void> {
	await page.evaluate(() => {
		const content = document.querySelector("[data-pen-editor-content]");
		if (!(content instanceof HTMLElement)) {
			throw new Error("forceExtraLayoutPass: missing editor content");
		}
		content.style.width = "40%";
		content.getBoundingClientRect();
		content.style.width = "";
		content.getBoundingClientRect();
	});
}

scenario(
	"OV1 OV2 SCH1: eight remote carets paint in one read phase with no extra layout passes",
	async (s, page) => {
		await s.load("hello-world");

		const blockId = (await s.geometry.blocks())[0]?.id;
		expect(blockId).toBeTruthy();
		const points: GeometryPoint[] = [];
		for (let offset = 0; offset < REMOTE_CARET_COUNT; offset += 1) {
			points.push({ blockId: blockId!, offset });
		}

		const layouts = await chromiumLayoutCount(page);

		// Mount the layer and the eight carets. First insert is not the budget:
		// creating the overlay sibling plus eight nodes dirties layout.
		const mounted = await s.geometry.flushEightRemoteCarets(points);
		expect(mounted.caretCount).toBe(REMOTE_CARET_COUNT);
		expect(mounted.paintedCount).toBe(REMOTE_CARET_COUNT);
		expect(mounted.overlayConnected).toBe(true);
		expect(mounted.overlayAttr).toBe("");
		expect(mounted.readPhase).toBe("read");
		expect(mounted.writePhase).toBe("write");
		expect(mounted.writePhaseMeasureCount).toBe(0);
		await expect(page.locator("[data-pen-overlay-layer]")).toBeAttached();
		await expect(page.locator('[data-pen-overlay-item="caret"]')).toHaveCount(
			REMOTE_CARET_COUNT,
		);

		// Drop the geometry cache so the budget flush remeasures instead of
		// reporting a cache-hit zero that could not fail.
		await s.geometry.invalidate();
		const layoutBeforeBudget = layouts ? await layouts.read() : null;
		const budget = await s.geometry.flushEightRemoteCarets(points);
		const layoutAfterBudget = layouts ? await layouts.read() : null;

		expect(budget.paintedCount).toBe(REMOTE_CARET_COUNT);
		expect(budget.readPhase).toBe("read");
		expect(budget.writePhase).toBe("write");
		expect(budget.writePhaseMeasureCount).toBe(0);
		expect(budget.readPhaseMeasureCount).toBeGreaterThan(0);
		expect(budget.items).toHaveLength(REMOTE_CARET_COUNT);

		const painted = await paintedCarets(page);
		assertPaintedMatchesPlan(budget.items, painted);

		const project = test.info().project.name;
		if (project === "chromium") {
			expect(layoutBeforeBudget).not.toBeNull();
			expect(layoutAfterBudget).not.toBeNull();
			const budgetPasses = layoutAfterBudget! - layoutBeforeBudget!;
			expect(
				budgetPasses,
				`OV1: 8 active remote carets cost ${budgetPasses} layout passes beyond a clean frame (CDP LayoutCount). Write-phase geometry reads=${budget.writePhaseMeasureCount}.`,
			).toBeLessThanOrEqual(1);

			const layoutBeforeForce = await layouts!.read();
			await forceExtraLayoutPass(page);
			const layoutAfterForce = await layouts!.read();
			const forcedPasses = layoutAfterForce - layoutBeforeForce;
			expect(
				forcedPasses,
				"OV1: CDP LayoutCount stayed flat on a forced extra layout read — the budget assertion would be inert.",
			).toBeGreaterThan(0);

			expect(budget.layoutShiftSupported).toBe(true);
			expect(budget.longTaskSupported).toBe(true);
			expect(budget.layoutShiftCount).toBe(0);
			expect(budget.longTaskCount).toBe(0);
			return;
		}

		if (budget.layoutShiftSupported) {
			expect(budget.layoutShiftCount).toBe(0);
		}
		if (budget.longTaskSupported) {
			expect(budget.longTaskCount).toBe(0);
		}
		expect(
			budget.paintedCount,
			`${project} painted ${budget.paintedCount} carets; PerformanceObserver types missing: ${budget.missingObserverTypes.join(", ") || "none"}`,
		).toBe(REMOTE_CARET_COUNT);
	},
);
