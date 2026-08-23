import { expect, test } from "@playwright/test";
import { loadavg } from "node:os";
import { formatCheckReport } from "../../src/checkReport";
import { scenario } from "../../src/scenario";
import { dispatchComposingKey, replayCompositionStart } from "../ime/compose";
import { readFocusOffset } from "./keys";

scenario(
	"K4: ArrowLeft during composition does not dispatch the caret command",
	async (s, page) => {
		const loads = loadavg();
		console.log(`K4 loadavg ${loads.join(" ")}`);

		await s.load("hello-world");
		await page.keyboard.press("End");
		const before = await readFocusOffset(page);
		expect(before).toBe(11);

		await replayCompositionStart(page);
		const prevented = await dispatchComposingKey(page, "ArrowLeft");
		const after = await readFocusOffset(page);

		await test.info().attach("k4-arrow", {
			body: JSON.stringify(
				{ loadavg: loads, before, after, prevented },
				null,
				2,
			),
			contentType: "application/json",
		});

		expect(
			after,
			formatCheckReport(
				"K4: caret stayed put while composing",
				after === before ? "passed" : "failed",
				`offset ${before} → ${after}; defaultPrevented=${prevented}`,
			),
		).toBe(before);
	},
	{
		initScript: () => {
			delete (globalThis as { EditContext?: unknown }).EditContext;
			delete (window as { EditContext?: unknown }).EditContext;
		},
	},
);
