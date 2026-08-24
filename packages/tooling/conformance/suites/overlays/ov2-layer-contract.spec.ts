import { expect, test, type Page } from "@playwright/test";
import { loadavg } from "node:os";
import { formatCheckReport } from "../../src/checkReport";
import { getInlineOffsetPoint } from "../../src/domGeometry";
import { scenario } from "../../src/scenario";
import type { ScenarioApi } from "../../src/types";

const HELLO_ID = "hello-p1";

type CaretPaint = {
	kind: "present" | "absent" | "unchecked";
	reason: string;
	pointerEvents: string;
	transform: string;
	styleLeft: string;
	styleTop: string;
	stylePosition: string;
	siblingOfContent: boolean;
};

function logLoad(label: string): number[] {
	const loads = loadavg();
	console.log(`${label} loadavg ${loads.join(" ")}`);
	return loads;
}

async function clickOffset(
	page: Page,
	blockId: string,
	offset: number,
): Promise<void> {
	const point = await getInlineOffsetPoint(page, { blockId, offset });
	await page.mouse.click(point.x, point.y);
}

async function paintLayerCaret(
	s: ScenarioApi,
	blockId: string,
	offset: number,
): Promise<void> {
	const flushed = await s.geometry.flushEightRemoteCarets([
		{ blockId, offset },
	]);
	expect(
		flushed.paintedCount,
		formatCheckReport(
			"OV2: paint-plan layer painted a caret item",
			flushed.paintedCount === 1 ? "passed" : "failed",
			`paintedCount=${flushed.paintedCount} overlayConnected=${String(flushed.overlayConnected)}`,
		),
	).toBe(1);
}

async function readCaretPaint(page: Page): Promise<CaretPaint> {
	return page.evaluate(() => {
		const layer = document.querySelector("[data-pen-overlay-layer]");
		const content = document.querySelector("[data-pen-editor-content]");
		const siblingOfContent =
			layer instanceof HTMLElement &&
			content != null &&
			layer.parentElement === content.parentElement;
		if (!(layer instanceof HTMLElement)) {
			return {
				kind: "unchecked" as const,
				reason: "overlay layer is not mounted — flush the paint-plan layer first",
				pointerEvents: "",
				transform: "",
				styleLeft: "",
				styleTop: "",
				stylePosition: "",
				siblingOfContent: false,
			};
		}
		const caret = layer.querySelector('[data-pen-overlay-item="caret"]');
		if (!(caret instanceof HTMLElement)) {
			return {
				kind: "absent" as const,
				reason: "overlay layer is mounted, caret item is missing",
				pointerEvents: getComputedStyle(layer).pointerEvents,
				transform: "",
				styleLeft: "",
				styleTop: "",
				stylePosition: layer.style.position,
				siblingOfContent,
			};
		}
		return {
			kind: "present" as const,
			reason: "overlay layer caret item is painted",
			pointerEvents: getComputedStyle(caret).pointerEvents,
			transform: caret.style.transform,
			styleLeft: caret.style.left,
			styleTop: caret.style.top,
			stylePosition: caret.style.position,
			siblingOfContent,
		};
	});
}

scenario(
	"OV2: overlay caret has pointer-events none so a click reaches the text",
	async (s, page) => {
		const loads = logLoad("OV2-pointer");
		await s.load("hello-world");
		await paintLayerCaret(s, HELLO_ID, 2);
		const paint = await readCaretPaint(page);
		await test.info().attach("ov2-pointer", {
			body: JSON.stringify({ loadavg: loads, paint }, null, 2),
			contentType: "application/json",
		});

		expect(
			paint.kind,
			formatCheckReport(
				"OV2: overlay layer caret is on screen to inspect pointer-events",
				paint.kind === "present" ? "passed" : "failed",
				paint.reason,
			),
		).toBe("present");
		expect(
			paint.pointerEvents,
			formatCheckReport(
				"OV2: caret pointer-events is none",
				paint.pointerEvents === "none" ? "passed" : "failed",
				`pointerEvents=${paint.pointerEvents}`,
			),
		).toBe("none");

		const before = await page.evaluate(
			() => window.__penConformance.documentText,
		);
		await clickOffset(page, HELLO_ID, 2);
		await page.keyboard.type("x");
		const after = await page.evaluate(
			() => window.__penConformance.documentText,
		);
		expect(
			after.includes("x") && after !== before,
			formatCheckReport(
				"OV2: typing still reaches the document through the overlay",
				after.includes("x") ? "passed" : "failed",
				`before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
			),
		).toBe(true);
	},
);

scenario(
	"OV2: overlay caret is painted with transforms only (no layout left/top)",
	async (s, page) => {
		const loads = logLoad("OV2-transform");
		await s.load("hello-world");
		await paintLayerCaret(s, HELLO_ID, 2);
		const paint = await readCaretPaint(page);
		await test.info().attach("ov2-transform", {
			body: JSON.stringify({ loadavg: loads, paint }, null, 2),
			contentType: "application/json",
		});

		expect(
			paint.kind,
			formatCheckReport(
				"OV2: overlay caret is on screen to inspect paint",
				paint.kind === "present" ? "passed" : "failed",
				paint.reason,
			),
		).toBe("present");
		expect(
			/translate3d\(/.test(paint.transform),
			formatCheckReport(
				"OV2: caret uses a translate3d paint",
				/translate3d\(/.test(paint.transform) ? "passed" : "failed",
				`transform=${paint.transform}`,
			),
		).toBe(true);
		const layoutFree =
			(paint.styleLeft === "" || paint.styleLeft === "0px") &&
			(paint.styleTop === "" || paint.styleTop === "0px");
		expect(
			layoutFree,
			formatCheckReport(
				"OV2: caret does not set layout-inducing left/top",
				layoutFree ? "passed" : "failed",
				`left=${paint.styleLeft} top=${paint.styleTop} position=${paint.stylePosition}`,
			),
		).toBe(true);
		expect(
			paint.siblingOfContent,
			formatCheckReport(
				"OV2: overlay host is a sibling of content",
				paint.siblingOfContent ? "passed" : "failed",
			),
		).toBe(true);
	},
);
