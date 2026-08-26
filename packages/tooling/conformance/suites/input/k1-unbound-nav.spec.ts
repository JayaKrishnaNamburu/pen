import { expect, test } from "@playwright/test";
import { loadavg } from "node:os";
import { formatCheckReport } from "../../src/checkReport";
import { scenario } from "../../src/scenario";
import {
	installKeyProbe,
	readFocusOffset,
	readKeyProbe,
} from "./keys";

scenario(
	"K1: unbound PageDown preventDefault so the browser cannot move the caret",
	async (s, page) => {
		const loads = loadavg();
		console.log(`K1 loadavg ${loads.join(" ")}`);

		await s.load("hello-world");
		await page.keyboard.press("End");
		await s.assert.selectionEquals({
			anchor: { blockId: "hello-p1", offset: 11 },
			focus: { blockId: "hello-p1", offset: 11 },
		});

		await installKeyProbe(page);
		const before = await readFocusOffset(page);
		await page.keyboard.press("PageDown");
		const probe = await readKeyProbe(page);
		const after = await readFocusOffset(page);
		const pageDown = probe.find((entry) => entry.key === "PageDown");

		await test.info().attach("k1-pagedown", {
			body: JSON.stringify({ loadavg: loads, before, after, probe }, null, 2),
			contentType: "application/json",
		});

		expect(
			pageDown ? "seen" : "missing",
			formatCheckReport(
				"K1: PageDown reached the field",
				pageDown ? "passed" : "failed",
				`probe=${JSON.stringify(probe)}`,
			),
		).toBe("seen");
		expect(
			pageDown!.defaultPrevented,
			formatCheckReport(
				"K1: unbound nav key preventDefault",
				pageDown!.defaultPrevented ? "passed" : "failed",
				`defaultPrevented=${pageDown!.defaultPrevented} offset ${before} → ${after}`,
			),
		).toBe(true);
		expect(
			after,
			formatCheckReport(
				"K1: caret stayed at the line end",
				after === before ? "passed" : "failed",
				`offset ${before} → ${after}`,
			),
		).toBe(before);
	},
);
