import { expect, test } from "@playwright/test";
import { scenario } from "../src/scenario";
import type { GeometryPoint } from "../src/types";
import { REMOTE_CARET_COUNT } from "../src/wave3Geometry";

scenario(
	"OV1 OV2 SCH1: eight remote carets paint in one read phase with no extra layout-shift or longtask",
	async (s, page) => {
		await s.load("hello-world");

		const blockId = (await s.geometry.blocks())[0]?.id;
		expect(blockId).toBeTruthy();
		const points: GeometryPoint[] = [];
		for (let offset = 0; offset < REMOTE_CARET_COUNT; offset += 1) {
			points.push({ blockId: blockId!, offset });
		}

		const budget = await s.geometry.flushEightRemoteCarets(points);
		const project = test.info().project.name;

		expect(budget.caretCount).toBe(REMOTE_CARET_COUNT);
		expect(budget.paintedCount).toBe(REMOTE_CARET_COUNT);
		expect(budget.overlayConnected).toBe(true);
		expect(budget.overlayAttr).toBe("");
		expect(budget.readPhase).toBe("read");
		expect(budget.writePhase).toBe("write");
		await expect(page.locator("[data-pen-overlay-layer]")).toBeAttached();
		await expect(page.locator('[data-pen-overlay-item="caret"]')).toHaveCount(
			REMOTE_CARET_COUNT,
		);

		if (project === "chromium") {
			expect(
				budget.layoutShiftSupported,
				`Chromium is missing PerformanceObserver layout-shift. supportedEntryTypes=${budget.supportedEntryTypes.join(",")}`,
			).toBe(true);
			expect(
				budget.longTaskSupported,
				`Chromium is missing PerformanceObserver longtask. supportedEntryTypes=${budget.supportedEntryTypes.join(",")}`,
			).toBe(true);
			expect(
				budget.layoutShiftCount,
				`OV1: layout-shift entries during the 8-caret flush: ${budget.layoutShiftValues.join(",")}`,
			).toBe(0);
			expect(
				budget.longTaskCount,
				"OV1: longtask entries during the 8-caret flush",
			).toBe(0);
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
