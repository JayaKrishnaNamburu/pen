import { expect, test } from "@playwright/test";

test("empty document accepts a first keystroke and undoes it with Mod-Z", async ({
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
		const block = document.querySelector("[data-pen-editor-block]");
		const inline = document.querySelector("[data-pen-inline-content]");
		if (
			!(root instanceof HTMLElement) ||
			!(block instanceof HTMLElement) ||
			!(inline instanceof HTMLElement)
		) {
			return null;
		}
		const blockBox = block.getBoundingClientRect();
		const inlineBox = inline.getBoundingClientRect();
		const x = blockBox.left + blockBox.width / 2;
		const y = blockBox.top + blockBox.height / 2;
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

	const afterType = await page.evaluate(() => {
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

	expect(afterType.activeSurface).toBe(true);
	expect(afterType.text).toContain("x");
	expect(afterType.selectionType).toBe("Caret");

	// Mod-Z is the silent-fail trap: bare createEditor() leaves
	// editor.undoManager as a stub whose canUndo() is false and
	// whose shortcut does nothing. The examples use defaultPreset();
	// this keystroke is what proves the batteries are actually live.
	await page.keyboard.press("ControlOrMeta+Z");

	const afterUndo = await page.evaluate(() => {
		const inline = document.querySelector("[data-pen-inline-content]");
		return inline?.textContent ?? "";
	});

	expect(afterUndo.includes("x")).toBe(false);
});
