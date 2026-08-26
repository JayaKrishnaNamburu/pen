import { expect, test } from "@playwright/test";

test("LOC1: pseudo-locale wraps editor chrome so English defaults cannot survive", async ({
	page,
}) => {
	await page.goto("/?pseudoLocale=1");
	const root = page.locator("[data-pen-editor-root]").first();
	await expect(root).toBeVisible();
	const label = await root.getAttribute("aria-label");
	expect(label).toMatch(/^\[\[.+ ···\]\]$/);
	expect(label).not.toBe("Editor");

	const slashInput = page.locator("[data-pen-slash-menu-input]");
	await expect(slashInput).toBeVisible();
	const placeholder = await slashInput.getAttribute("placeholder");
	expect(placeholder).toMatch(/^\[\[.+ ···\]\]$/);
	expect(placeholder).not.toBe("Search blocks...");

	const heading = page.locator("[data-pen-slash-menu-group-heading]").first();
	await expect(heading).toBeVisible();
	const headingText = (await heading.textContent()) ?? "";
	expect(headingText).toMatch(/^\[\[.+ ···\]\]$/);
	expect(headingText).not.toBe("Basic");

	const item = page.locator("[data-pen-slash-menu-item]").first();
	const itemText = (await item.textContent()) ?? "";
	expect(itemText).toMatch(/^\[\[.+ ···\]\]$/);
	expect(itemText).not.toBe("Paragraph");

	const searchInput = page.locator("[data-pen-search-input]");
	await expect(searchInput).toBeVisible();
	const searchLabel = await searchInput.getAttribute("aria-label");
	const searchPlaceholder = await searchInput.getAttribute("placeholder");
	expect(searchLabel).toMatch(/^\[\[.+ ···\]\]$/);
	expect(searchLabel).not.toBe("Find in document");
	expect(searchPlaceholder).toMatch(/^\[\[.+ ···\]\]$/);
	expect(searchPlaceholder).not.toBe("Search...");

	const results = page.locator("[data-pen-search-results]");
	const resultsLabel = await results.getAttribute("aria-label");
	const resultsText = ((await results.textContent()) ?? "").trim();
	expect(resultsLabel).toMatch(/^\[\[.+ ···\]\]$/);
	expect(resultsLabel).not.toBe("Search results");
	expect(resultsText).toMatch(/^\[\[.+ ···\]\]$/);
	expect(resultsText).not.toBe("No matches");

	const previousLabel = await page
		.locator("[data-pen-search-navigation][data-option='previous']")
		.getAttribute("aria-label");
	const nextLabel = await page
		.locator("[data-pen-search-navigation][data-option='next']")
		.getAttribute("aria-label");
	expect(previousLabel).toMatch(/^\[\[.+ ···\]\]$/);
	expect(previousLabel).not.toBe("Previous match");
	expect(nextLabel).toMatch(/^\[\[.+ ···\]\]$/);
	expect(nextLabel).not.toBe("Next match");
});
