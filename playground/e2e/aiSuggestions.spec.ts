import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
	await page.route("**/api/ai/session", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				sessionId: "playground-e2e-session",
			}),
		});
	});

	await page.route("**/api/ai/session/sync", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				ok: true,
			}),
		});
	});

	await page.route("**/api/ai", async (route) => {
		const request = route.request();
		const body = request.postDataJSON() as
			| {
					requestMode?: string;
					suggestionScope?: {
						targetText?: string;
					};
			  }
			| undefined;

		if (body?.requestMode === "ai-suggestions") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					suggestions: [
						{
							kind: "clarity",
							title: "Simplify wording",
							originalText: "loved to explore",
							replacementText: "explored",
							reason: "Make the sentence more concise.",
							confidence: 0.98,
						},
					],
					usage: {
						promptTokens: 12,
						completionTokens: 5,
					},
				}),
			});
			return;
		}

		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				error: `Unhandled AI request in e2e: ${body?.requestMode ?? "unknown"}`,
			}),
		});
	});

	await page.goto(`/?room=${createRoomId()}`);
	const collaborationNameInput = page.getByLabel("Display name");
	if (await collaborationNameInput.isVisible()) {
		await collaborationNameInput.fill("Playwright");
		await page.getByRole("button", { name: "Join playground" }).click();
	}
	await expect(page.locator("[data-pen-inline-content]").first()).toBeVisible();
});

test("renders AI suggestions with the custom line styling", async ({ page }) => {
	const firstInline = page.locator("[data-pen-inline-content]").first();
	await firstInline.click();
	await page.keyboard.type(
		"Once upon a time, Lily loved to explore the enchanted forest.",
	);

	await triggerAISuggestions(page);

	const suggestionAnchor = page.locator("[data-ai-suggestion-id]").first();
	await expect(suggestionAnchor).toBeVisible();

	const suggestionStyle = await suggestionAnchor.evaluate((element) => ({
		style: element.getAttribute("style") ?? "",
		backgroundImage: window.getComputedStyle(element).backgroundImage,
		textDecorationLine: window.getComputedStyle(element).textDecorationLine,
		textDecorationStyle: window.getComputedStyle(element).textDecorationStyle,
	}));

	expect(suggestionStyle.style).toContain("background-size: 100% 2px");
	expect(suggestionStyle.style).not.toContain("text-decoration");
	expect(suggestionStyle.backgroundImage).not.toBe("none");
	expect(suggestionStyle.textDecorationLine).toBe("none");
	expect(suggestionStyle.textDecorationStyle).not.toBe("wavy");
});

test("opens the popover and applies the active suggestion", async ({ page }) => {
	const firstInline = page.locator("[data-pen-inline-content]").first();
	await firstInline.click();
	await page.keyboard.type(
		"Once upon a time, Lily loved to explore the enchanted forest.",
	);

	await triggerAISuggestions(page);

	const suggestionAnchor = page.locator("[data-ai-suggestion-id]").first();
	await expect(suggestionAnchor).toBeVisible();
	await suggestionAnchor.click();

	const popover = page.locator("[data-pen-ai-suggestions-popover]");
	await expect(popover).toBeVisible();
	await expect(popover).toContainText("Simplify wording");
	await expect(popover).toContainText("explored");

	await page.getByRole("button", { name: "Apply" }).click();

	await expect(firstInline).toContainText(
		"Once upon a time, Lily explored the enchanted forest.",
	);
	await expect(popover).toHaveCount(0);
	await expect(page.locator("[data-ai-suggestion-id]")).toHaveCount(0);
});

test("dismisses the active suggestion without changing the text", async ({ page }) => {
	const firstInline = page.locator("[data-pen-inline-content]").first();
	await firstInline.click();
	await page.keyboard.type(
		"Once upon a time, Lily loved to explore the enchanted forest.",
	);

	await triggerAISuggestions(page);

	const suggestionAnchor = page.locator("[data-ai-suggestion-id]").first();
	await expect(suggestionAnchor).toBeVisible();
	await suggestionAnchor.click();

	const popover = page.locator("[data-pen-ai-suggestions-popover]");
	await expect(popover).toBeVisible();

	await page.getByRole("button", { name: "Dismiss" }).click();

	await expect(popover).toHaveCount(0);
	await expect(page.locator("[data-ai-suggestion-id]")).toHaveCount(0);
	await expect(firstInline).toContainText(
		"Once upon a time, Lily loved to explore the enchanted forest.",
	);
});

async function triggerAISuggestions(page: import("@playwright/test").Page) {
	await page.evaluate(async () => {
		const api = window.penPlayground?.aiSuggestions;
		if (!api) {
			throw new Error("Missing playground AI suggestions debug API.");
		}
		api.updateSettings({
			debounceMs: 0,
			minChangedChars: 1,
			minStableMs: 0,
		});
		const triggered = api.trigger();
		if (!triggered) {
			throw new Error("Failed to trigger AI suggestions.");
		}
	});
}

function createRoomId(): string {
	return `pen-ai-suggestions-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
