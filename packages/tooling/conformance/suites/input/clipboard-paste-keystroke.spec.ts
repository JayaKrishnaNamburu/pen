import { expect, test } from "@playwright/test";
import { loadavg } from "node:os";
import { formatCheckReport } from "../../src/checkReport";
import { scenario } from "../../src/scenario";
import { readDocumentText } from "./keys";

const PASTE_MARK = "PASTE-MARKER";

scenario(
	"B1: clipboard paste keystroke inserts into an empty block",
	async (s, page) => {
		const loads = loadavg();
		console.log(`clipboard-paste loadavg ${loads.join(" ")}`);
		// Harness limit, not a product limit: only Chromium implements the
		// clipboard permissions, so WebKit and Firefox both throw "Unknown
		// permission: clipboard-read" before the paste is ever attempted. Reading
		// the system clipboard some other way would test a different path than the
		// keystroke, so the honest record is an engine gap rather than a green.
		test.skip(
			test.info().project.name !== "chromium",
			"grantPermissions(clipboard-read) is Chromium-only in Playwright",
		);

		await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
		await s.load("empty");
		await page.evaluate(async (text) => {
			await navigator.clipboard.writeText(text);
		}, PASTE_MARK);

		const modifier = process.platform === "darwin" ? "Meta" : "Control";
		await page.keyboard.press(`${modifier}+v`);
		const text = await readDocumentText(page);

		await test.info().attach("clipboard-paste", {
			body: JSON.stringify({ loadavg: loads, text }, null, 2),
			contentType: "application/json",
		});

		expect(
			text.includes(PASTE_MARK),
			formatCheckReport(
				"B1: paste keystroke reached the authority",
				text.includes(PASTE_MARK) ? "passed" : "failed",
				`text=${JSON.stringify(text)}`,
			),
		).toBe(true);
		await s.assert.domMatchesAuthority();
	},
);
