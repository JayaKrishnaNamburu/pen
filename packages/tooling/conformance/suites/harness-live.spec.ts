import { expect } from "@playwright/test";
import { NESTED_TOGGLE_CHILD_TEXT } from "../fixtures/catalog";
import { scenario } from "../src/scenario";
import { sampleCaretPoints } from "../src/g5Geometry";

scenario("harness: importHtml is live", async (s) => {
	await s.load("empty");
	await s.importHtml("<p>Imported live probe</p>");
	await s.assert.textContains("Imported live probe");
});

scenario("harness: remoteApply reaches the local document", async (s) => {
	await s.load("hello-world");
	await s.remote.apply([
		{
			type: "splice-text",
			blockId: "hello-p1",
			from: 0,
				to: 0,
				insert: "R",
		},
	]);
	await s.assert.textContains("RHello");
});

scenario("harness: remote.splice reaches the local document", async (s) => {
	await s.load("hello-world");
	await s.remote.splice({ block: 0, from: 0, to: 0, insert: "Q" });
	await s.assert.textContains("QHello");
});

scenario("harness: lastEvents records commit", async (s, page) => {
	await s.load("hello-world");
	await s.keyboard.type("z");
	const types = await page.evaluate(() =>
		window.__penConformance.lastEvents.map((event) => event.type),
	);
	expect(types).toContain("commit");
});

scenario("harness: documentText includes nested children", async (s) => {
	await s.load("nested-toggle");
	await s.assert.textContains(NESTED_TOGGLE_CHILD_TEXT);
});

scenario("harness: empty fixture has no letters", async (s, page) => {
	await s.load("empty");
	const text = await page.evaluate(
		() => window.__penConformance.documentText,
	);
	expect(
		text,
		"empty fixture shipped letters — HOST6 empty-click cannot fail",
	).not.toMatch(/\p{L}/u);
	const snap = await page.evaluate(() =>
		window.__penConformance.documentSnapshot(),
	);
	expect(snap.blocks).toHaveLength(1);
	expect(snap.blocks[0]?.id).toBe("empty-p1");
});

scenario("harness: bidi-mixed is mixed by construction", async (s, page) => {
	await s.load("bidi-mixed");
	const snap = await page.evaluate(() =>
		window.__penConformance.documentSnapshot(),
	);
	const directions = snap.blocks.map((block) => block.props.direction);
	expect(directions).toContain("ltr");
	expect(directions).toContain("rtl");
	const text = await page.evaluate(
		() => window.__penConformance.documentText,
	);
	expect(text).toMatch(/[\u0590-\u05FF\u0600-\u06FF]/);
});

scenario(
	"harness: g5-geometry atoms block is plain text",
	async (s, page) => {
		await s.load("g5-geometry");
		const snap = await page.evaluate(() =>
			window.__penConformance.documentSnapshot(),
		);
		const atoms = snap.blocks.find((block) => block.id === "g5-atoms");
		const empty = snap.blocks.find((block) => block.id === "g5-empty");
		expect(atoms?.text).toBe("LEFT WRAP ATOM LINE");
		expect(
			atoms?.deltas.some((delta) => typeof delta.insert === "object"),
			"g5-atoms shipped an inline atom; scenarios insert that themselves",
		).toBe(false);
		expect(empty?.text, "g5-empty shipped letters").not.toMatch(/\p{L}/u);
	},
);

scenario("harness: caretRect compare is live on hello-world", async (s) => {
	await s.load("hello-world");
	const points = sampleCaretPoints(await s.geometry.blocks());
	expect(points.length).toBeGreaterThan(0);
	const compare = await s.geometry.compare(points);
	expect(
		compare.missingCount,
		"caretRect returned null; staleCount stays 0 when both sides are null",
	).toBe(0);
	expect(compare.staleCount).toBe(0);
	expect(compare.compares.length).toBeGreaterThan(0);
	for (const entry of compare.compares) {
		expect(
			entry.cached,
			`cached caretRect was null at ${entry.point.blockId}:${entry.point.offset}`,
		).not.toBeNull();
		expect(entry.fromScratch).not.toBeNull();
	}
});

scenario(
	"harness: scanHostileDom detects a planted javascript URL",
	async (s, page) => {
		await s.load("hello-world");
		await page.evaluate(() => {
			const root = document.querySelector("[data-pen-editor-root]");
			if (!(root instanceof HTMLElement)) {
				throw new Error("missing editor root");
			}
			const anchor = document.createElement("a");
			anchor.setAttribute("href", "javascript:void(0)");
			root.append(anchor);
		});
		const scan = await page.evaluate(() =>
			window.__penConformance.scanHostileDom(),
		);
		expect(
			scan.javascriptUrls.length,
			"scanHostileDom missed a planted javascript: href — corpusSafe would stay green",
		).toBeGreaterThan(0);
	},
	{ axe: false },
);

scenario(
	"harness: xss probe can trip",
	async (s, page) => {
		await s.load("hello-world");
		await page.evaluate(() => {
			window.__penConformance.resetXssProbe();
			window.__xssProbe();
		});
		const scan = await page.evaluate(() =>
			window.__penConformance.scanHostileDom(),
		);
		expect(scan.probeTripped, "xss probe helper is a no-op").toBe(true);
		await page.evaluate(() => {
			window.__penConformance.resetXssProbe();
		});
		const reset = await page.evaluate(() =>
			window.__penConformance.scanHostileDom(),
		);
		expect(reset.probeTripped, "resetXssProbe is a no-op").toBe(false);
	},
	{ axe: false },
);
