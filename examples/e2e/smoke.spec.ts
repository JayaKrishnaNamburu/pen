import { expect, test } from "@playwright/test";

test("empty document accepts a first keystroke from an editor-root click", async ({
	page,
}) => {
	await page.goto("/");

	const editor = page.getByRole("textbox", { name: "Editor" });
	await expect(editor).toBeVisible();

	// strip the example's cosmetic inline min-width so a 0-width empty
	// surface cannot hide a dead first click the way the old span-target test did
	await page.evaluate(() => {
		for (const style of document.querySelectorAll("style")) {
			const text = style.textContent ?? "";
			if (!text.includes("[data-pen-inline-content]")) {
				continue;
			}
			style.textContent = text.replace(
				/\[data-pen-inline-content\]\s*\{[^}]*\}/g,
				"",
			);
		}
	});

	const before = await page.evaluate(() => {
		const root = document.querySelector("[data-pen-editor-root]");
		const inline = document.querySelector("[data-pen-inline-content]");
		if (!(root instanceof HTMLElement) || !(inline instanceof HTMLElement)) {
			return null;
		}
		const rootBox = root.getBoundingClientRect();
		const inlineBox = inline.getBoundingClientRect();
		const x = rootBox.left + rootBox.width / 2;
		const y = rootBox.top + rootBox.height / 2;
		const hit = document.elementFromPoint(x, y);
		return {
			inlineWidth: inlineBox.width,
			inlineHeight: inlineBox.height,
			inlineText: inline.textContent ?? "",
			hitInline: hit instanceof HTMLElement && hit === inline,
			hitBlock:
				hit instanceof HTMLElement &&
				Boolean(hit.closest("[data-pen-editor-block]")),
			activeSurface: Boolean(
				document.querySelector("[data-pen-field-editor-active-surface]"),
			),
			clickX: x,
			clickY: y,
		};
	});

	expect(before).not.toBeNull();
	expect(before?.inlineWidth).toBe(0);
	expect(before?.inlineHeight).toBeGreaterThan(0);
	expect(before?.hitInline).toBe(false);
	expect(before?.hitBlock).toBe(true);
	expect(before?.inlineText.includes("x")).toBe(false);
	expect(before?.activeSurface).toBe(false);

	await page.mouse.click(before!.clickX, before!.clickY);
	await page.keyboard.type("x");

	const after = await page.evaluate(() => {
		const inline = document.querySelector("[data-pen-inline-content]");
		const selection = document.getSelection();
		return {
			text: inline?.textContent ?? "",
			activeSurface: Boolean(
				document.querySelector("[data-pen-field-editor-active-surface]"),
			),
			selectionType: selection?.type ?? "",
		};
	});

	expect(after.activeSurface).toBe(true);
	expect(after.text).toContain("x");
	expect(after.selectionType).toBe("Caret");
});
