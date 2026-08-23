import { expect, test } from "@playwright/test";
import { loadavg } from "node:os";
import { formatCheckReport } from "../../src/checkReport";
import { scenario } from "../../src/scenario";
import { readBackend, readDocumentText } from "./keys";

scenario(
	"B2: EditContext typing commits through insertText on the preferred backend",
	async (s, page) => {
		const loads = loadavg();
		console.log(`B2 loadavg ${loads.join(" ")}`);
		test.skip(
			test.info().project.name !== "chromium",
			"B2 is the EditContext textupdate sensor; Chromium only",
		);

		expect(
			await page.evaluate(
				() => typeof (globalThis as { EditContext?: unknown }).EditContext,
			),
		).not.toBe("undefined");

		await s.load("hello-world");
		await page.keyboard.press("End");
		const backend = await readBackend(page);
		expect(
			backend.hasEditContext,
			formatCheckReport(
				"B2: live surface has an EditContext",
				backend.hasEditContext ? "passed" : "failed",
				JSON.stringify(backend),
			),
		).toBe(true);

		await page.keyboard.type("Q");
		const text = await readDocumentText(page);
		const commits = await page.evaluate(() =>
			window.__penConformance.lastEvents.filter(
				(event) => event.type === "documentCommit",
			),
		);

		await test.info().attach("b2-type", {
			body: JSON.stringify({ loadavg: loads, backend, text, commits }, null, 2),
			contentType: "application/json",
		});

		expect(
			text.includes("Hello worldQ"),
			formatCheckReport(
				"B2: typed character reached the authority",
				text.includes("Hello worldQ") ? "passed" : "failed",
				`text=${JSON.stringify(text)}`,
			),
		).toBe(true);
		expect(
			commits.length,
			formatCheckReport(
				"B2: typing produced a documentCommit",
				commits.length > 0 ? "passed" : "failed",
				`commits=${commits.length}`,
			),
		).toBeGreaterThan(0);
		await s.assert.domMatchesAuthority();
	},
);
