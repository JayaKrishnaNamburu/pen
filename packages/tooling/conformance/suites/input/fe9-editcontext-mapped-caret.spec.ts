import { expect, test } from "@playwright/test";
import { formatCheckReport } from "../../src/checkReport";
import { scenario } from "../../src/scenario";
import { readBackend, readDocumentText } from "./keys";

scenario(
	"FE9: a programmatic splice does not leave the next EditContext keystroke at the pre-apply caret",
	async (s, page) => {
		test.skip(
			test.info().project.name !== "chromium",
			"FE9 is the EditContext textupdate sensor; Chromium only",
		);

		expect(
			await page.evaluate(
				() =>
					typeof (globalThis as { EditContext?: unknown }).EditContext,
			),
		).not.toBe("undefined");

		await s.load("hello-world");
		const blockId = await page.evaluate(
			() => window.__penConformance.blockIds[0],
		);
		expect(blockId).toBeTruthy();

		await s.apply([
			{
				type: "splice-text",
				blockId: blockId!,
				from: 0,
				to: 11,
				insert: "aa :sm bb",
			},
		]);
		await s.selectText(0, 6);

		const backend = await readBackend(page);
		expect(
			backend.hasEditContext,
			formatCheckReport(
				"FE9: live surface has an EditContext",
				backend.hasEditContext ? "passed" : "failed",
				JSON.stringify(backend),
			),
		).toBe(true);

		await s.apply([
			{
				type: "splice-text",
				blockId: blockId!,
				from: 3,
				to: 6,
				insert: "",
			},
		]);

		await page.keyboard.type("x");
		const text = await readDocumentText(page);

		expect(
			text.includes("aa x bb"),
			formatCheckReport(
				"FE9: typed character lands at the remapped caret",
				text.includes("aa x bb") ? "passed" : "failed",
				`text=${JSON.stringify(text)}`,
			),
		).toBe(true);
		expect(
			text.includes("aa  bbx"),
			formatCheckReport(
				"FE9: typed character must not land at the stale end caret",
				text.includes("aa  bbx") ? "failed" : "passed",
				`text=${JSON.stringify(text)}`,
			),
		).toBe(false);
		await s.assert.domMatchesAuthority();
	},
);
