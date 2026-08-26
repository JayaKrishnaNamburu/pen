import { expect } from "@playwright/test";
import { scenario } from "../src/scenario";

scenario(
	"HOST6: unstyled harness stays editable with a visible caret and focus indication",
	async (s, page) => {
		await s.load("hello-world");
		const stylesheets = await page.evaluate(() =>
			[...document.styleSheets].map((sheet) => sheet.href),
		);
		expect(
			stylesheets.filter((href) => href != null && href.includes("styles.css")),
		).toEqual([]);

		await s.keyboard.type("!");
		await s.assert.textContains("Hello");
		await s.assert.textContains("!");

		const focus = await page.evaluate(() => {
			const active = document.activeElement;
			if (!(active instanceof HTMLElement)) {
				return null;
			}
			const style = getComputedStyle(active);
			const outlineWidth = Number.parseFloat(style.outlineWidth);
			const caret = document.querySelector("[data-pen-editor-caret]");
			const caretRect = caret?.getBoundingClientRect();
			return {
				insideEditor: Boolean(
					document.querySelector("[data-pen-editor-root]")?.contains(active),
				),
				caretColor: style.caretColor,
				outlineStyle: style.outlineStyle,
				outlineWidth,
				caretOverlayVisible: Boolean(
					caretRect && caretRect.width > 0 && caretRect.height > 0,
				),
			};
		});

		expect(focus?.insideEditor).toBe(true);
		expect(focus?.caretColor).not.toBe("transparent");
		const uaRing =
			focus != null &&
			focus.outlineStyle !== "none" &&
			focus.outlineWidth > 0;
		expect(
			uaRing || focus?.caretOverlayVisible,
			"HOST6: focus must show a UA ring or the caret overlay",
		).toBe(true);
	},
	{ url: "/?unstyled=1" },
);
