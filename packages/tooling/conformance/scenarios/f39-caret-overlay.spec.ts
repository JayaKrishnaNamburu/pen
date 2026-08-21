import { expect } from "@playwright/test";
import { getInlineOffsetPoint } from "../src/domGeometry";
import { scenario } from "../src/scenario";

scenario(
	"F39 HOST6: renders a custom local caret for collapsed selections only",
	async (s, page) => {
		await s.load("hello-world");
		const caretPoint = await getInlineOffsetPoint(page, {
			blockId: "hello-p1",
			offset: 2,
		});
		await page.mouse.click(caretPoint.x, caretPoint.y);

		const caret = page.locator("[data-pen-editor-caret]");
		await expect(caret).toBeVisible();
		await expect(caret).toHaveAttribute("data-block-id", "hello-p1");
		await expect(caret).toHaveAttribute("data-offset", "2");

		const collapsed = await page.evaluate(() => {
			const caretElement = document.querySelector(
				"[data-pen-editor-caret]",
			);
			const overlay = document.querySelector(
				"[data-pen-editor-caret-overlay]",
			);
			const surface = document.querySelector(
				"[data-pen-field-editor-active-surface], [data-pen-inline-content]",
			);
			if (
				!(caretElement instanceof HTMLElement) ||
				!(overlay instanceof HTMLElement) ||
				!(surface instanceof HTMLElement)
			) {
				return null;
			}
			const rect = caretElement.getBoundingClientRect();
			return {
				animationName: caretElement.style.animationName,
				caretColor: surface.style.caretColor,
				overlayVisible: overlay.hasAttribute("data-caret-visible"),
				width: rect.width,
				height: rect.height,
				left: rect.left,
				top: rect.top,
			};
		});
		expect(collapsed).not.toBeNull();
		expect(collapsed?.animationName).toBe("none");
		expect(collapsed?.caretColor).toBe("transparent");
		expect(collapsed?.overlayVisible).toBe(true);
		expect(collapsed?.width).toBeGreaterThan(0);
		expect(collapsed?.height).toBeGreaterThan(0);
		expect(collapsed?.left).toBeGreaterThan(0);
		expect(collapsed?.top).toBeGreaterThan(0);

		await page.evaluate(
			() => new Promise<void>((resolve) => setTimeout(resolve, 550)),
		);
		await expect(caret).toBeVisible();

		await page.evaluate(() => {
			const surface = document.querySelector(
				"[data-pen-field-editor-active-surface], [data-pen-inline-content]",
			);
			if (!(surface instanceof HTMLElement)) {
				throw new Error("missing field-editor surface");
			}
			surface.dispatchEvent(
				new InputEvent("beforeinput", {
					bubbles: true,
					cancelable: true,
					inputType: "insertText",
					data: "",
				}),
			);
		});
		expect(
			await page.evaluate(() => {
				const caretElement = document.querySelector(
					"[data-pen-editor-caret]",
				);
				return caretElement instanceof HTMLElement
					? caretElement.style.animationName
					: "";
			}),
		).toBe("none");

		const rangeStart = await getInlineOffsetPoint(page, {
			blockId: "hello-p1",
			offset: 1,
		});
		await page.mouse.click(rangeStart.x, rangeStart.y);
		await page.keyboard.down("Shift");
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("ArrowRight");
		await page.keyboard.up("Shift");
		await expect
			.poll(async () => {
				const selection = await page.evaluate(
					() => window.__penConformance.selection,
				);
				return selection?.type === "text" && !selection.isCollapsed;
			})
			.toBe(true);
		await expect(page.locator("[data-pen-editor-caret]")).toHaveCount(0);
		const expanded = await page.evaluate(() => {
			const overlay = document.querySelector(
				"[data-pen-editor-caret-overlay]",
			);
			const surface = document.querySelector(
				"[data-pen-field-editor-active-surface], [data-pen-inline-content]",
			);
			return {
				overlayVisible:
					overlay instanceof HTMLElement &&
					overlay.hasAttribute("data-caret-visible"),
				caretColor:
					surface instanceof HTMLElement ? surface.style.caretColor : null,
			};
		});
		expect(expanded.overlayVisible).toBe(false);
		expect(expanded.caretColor).not.toBe("transparent");
	},
	{ url: "/?ax6=1" },
);
