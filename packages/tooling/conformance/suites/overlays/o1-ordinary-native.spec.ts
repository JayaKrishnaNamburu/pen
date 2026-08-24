import { expect, test, type Page } from "@playwright/test";
import { loadavg } from "node:os";
import { formatCheckReport } from "../../src/checkReport";
import { getInlineOffsetPoint } from "../../src/domGeometry";
import { scenario } from "../../src/scenario";

const HELLO_ID = "hello-p1";

type OverlaySnapshot = {
	kind: "present" | "absent";
	reason: string;
	overlayVisible: boolean;
	caretColor: string | null;
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
	await expect
		.poll(async () => {
			return page.evaluate(() => {
				const selection = window.__penConformance.selection;
				if (selection?.type !== "text") {
					return "not-text";
				}
				return `${selection.focus.blockId}:${selection.focus.offset}`;
			});
		})
		.toBe(`${blockId}:${offset}`);
}

async function readOverlay(page: Page): Promise<OverlaySnapshot> {
	return page.evaluate(() => {
		const overlay = document.querySelector(
			"[data-pen-editor-caret-overlay]",
		);
		const caret = document.querySelector("[data-pen-editor-caret]");
		const surface = document.querySelector(
			"[data-pen-field-editor-active-surface], [data-pen-inline-content]",
		);
		const caretColor =
			surface instanceof HTMLElement ? surface.style.caretColor : null;
		const visible =
			overlay instanceof HTMLElement &&
			overlay.hasAttribute("data-caret-visible");
		if (caret instanceof HTMLElement && visible) {
			return {
				kind: "present" as const,
				reason: "overlay caret is drawn for an ordinary collapsed caret",
				overlayVisible: true,
				caretColor,
			};
		}
		return {
			kind: "absent" as const,
			reason:
				overlay instanceof HTMLElement
					? "overlay host mounted, caret not drawn"
					: "default editor has no CaretOverlay; native caret path",
			overlayVisible: visible,
			caretColor,
		};
	});
}

scenario(
	"O1: ordinary collapsed caret keeps the native caret; overlay is reserved for atom edges",
	async (s, page) => {
		// Spec O1 (03-selection.md §6): native caret is the display inside the
		// active field. Do not load ?ax6=1 — that flag mounts
		// Pen.Editor.CaretOverlay, a host-opt-in primitive that paints every
		// collapsed caret (pre-OV3). Forcing that primitive on and then
		// requiring it not to paint tests the wrong overlay. Atom-edge overlay
		// ink is the ax6 O1 scenario in live-rules.spec.ts.
		const loads = logLoad("O1-ordinary");
		await s.load("hello-world");
		await clickOffset(page, HELLO_ID, 2);
		const overlay = await readOverlay(page);
		await test.info().attach("o1-ordinary", {
			body: JSON.stringify({ loadavg: loads, overlay }, null, 2),
			contentType: "application/json",
		});

		expect(
			overlay.kind,
			formatCheckReport(
				"O1: ordinary caret is native, not overlay",
				overlay.kind === "absent" ? "passed" : "failed",
				overlay.reason,
			),
		).toBe("absent");
		expect(
			overlay.caretColor === "transparent",
			formatCheckReport(
				"O1: native caret-color stays visible on an ordinary caret",
				overlay.caretColor === "transparent" ? "failed" : "passed",
				`caretColor=${overlay.caretColor}`,
			),
		).toBe(false);
	},
);
