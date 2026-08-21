import { expect } from "@playwright/test";
import { NESTED_TOGGLE_CHILD_TEXT } from "../fixtures/catalog";
import { scenario } from "../src/scenario";

scenario("harness: importHtml is live", async (s) => {
	await s.load("empty");
	await s.importHtml("<p>Imported live probe</p>");
	await s.assert.textContains("Imported live probe");
});

scenario("harness: remoteApply reaches the local document", async (s) => {
	await s.load("hello-world");
	await s.remote.apply([
		{
			type: "insert-text",
			blockId: "hello-p1",
			offset: 0,
			text: "R",
		},
	]);
	await s.assert.textContains("RHello");
});

scenario("harness: lastEvents records documentCommit", async (s, page) => {
	await s.load("hello-world");
	await s.keyboard.type("z");
	const types = await page.evaluate(() =>
		window.__penConformance.lastEvents.map((event) => event.type),
	);
	expect(types).toContain("documentCommit");
});

scenario("harness: documentText includes nested children", async (s) => {
	await s.load("nested-toggle");
	await s.assert.textContains(NESTED_TOGGLE_CHILD_TEXT);
});
