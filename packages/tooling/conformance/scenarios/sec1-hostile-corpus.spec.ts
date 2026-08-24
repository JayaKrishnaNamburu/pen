import { expect } from "@playwright/test";
import {
	HOSTILE_HTML,
	HOSTILE_TOOL_INSERT_BLOCK_JSON,
	JAVASCRIPT_HREF,
	JAVASCRIPT_IMAGE_SRC,
} from "../fixtures/hostile/vectors";
import { scenario } from "../src/scenario";

scenario(
	"SEC1 S.0 F1: javascript: link mark renders inert (S.1 already landed)",
	async (s, page) => {
		await s.load("hello-world");
		await s.apply([
			{
				type: "format-text",
				blockId: "hello-p1",
				from: 0,
				to: 11,
				marks: { link: { href: JAVASCRIPT_HREF } },
			},
		]);
		await expect(page.locator("[data-pen-blocked-url]")).toBeVisible();
		await s.assert.corpusSafe({ requireBlockedUrl: true });
		await page.locator("[data-pen-blocked-url]").first().click();
		await s.assert.xssProbeNotTripped();
	},
);

scenario("SEC1 S.0 import: hostile HTML corpus stays inert", async (s) => {
	await s.load("hello-world");
	await s.importHtml(
		HOSTILE_HTML.urls +
			HOSTILE_HTML.eventHandlers +
			HOSTILE_HTML.attributeBreakout +
			HOSTILE_HTML.mxss +
			HOSTILE_HTML.cssExpression +
			HOSTILE_HTML.malformed,
	);
	await s.assert.corpusSafe();
});

scenario("SEC1 S.0 paste: hostile HTML corpus stays inert", async (s) => {
	await s.load("hello-world");
	await s.pasteHtml(HOSTILE_HTML.urls + HOSTILE_HTML.eventHandlers);
	await s.assert.corpusSafe();
});

scenario(
	"SEC1 S.0 collaborative injection: remote javascript: link and image are inert",
	async (s, page) => {
		await s.load("hello-world");
		await s.remote.apply([
			{
				type: "format-text",
				blockId: "hello-p1",
				from: 0,
				to: 11,
				marks: { link: { href: JAVASCRIPT_HREF } },
			},
			{
				type: "insert-block",
				blockId: "hostile-img",
				blockType: "image",
				props: { src: JAVASCRIPT_IMAGE_SRC, alt: "x" },
				position: "last",
			},
		]);
		await expect(page.locator("[data-pen-blocked-url]").first()).toBeVisible();
		await s.assert.corpusSafe({ requireBlockedUrl: true });
		await page.locator("[data-pen-blocked-url]").first().click();
		await s.assert.xssProbeNotTripped();
	},
);

scenario(
	"SEC1 S.1 raw Y-update injection: javascript: link and image stay inert",
	async (s, page) => {
		await s.load("hello-world");
		await s.remote.injectY({
			link: { blockId: "hello-p1", href: JAVASCRIPT_HREF },
			image: { blockId: "hostile-img-y", src: JAVASCRIPT_IMAGE_SRC },
		});
		await expect(page.locator("[data-pen-blocked-url]").first()).toBeVisible();
		await s.assert.corpusSafe({ requireBlockedUrl: true });
		await page.locator("[data-pen-blocked-url]").first().click();
		await s.assert.xssProbeNotTripped();
	},
);

scenario("SEC6 S.6 tool payload: proto keys do not apply", async (s, page) => {
	await s.load("hello-world");
	const result = await s.applyToolPayloads(HOSTILE_TOOL_INSERT_BLOCK_JSON);
	expect(result.ok).toBe(false);
	expect(result.message).toMatch(/Prototype keys are not allowed/);
	const ids = await page.evaluate(() => window.__penConformance.blockIds);
	expect(ids).not.toContain("hostile-tool");
	expect(
		await page.evaluate(() =>
			Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"),
		),
	).toBe(false);
	await s.assert.corpusSafe();
});
