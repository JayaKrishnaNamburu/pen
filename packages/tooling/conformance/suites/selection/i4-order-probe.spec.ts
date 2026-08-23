import { expect, type Page } from "@playwright/test";
import { loadavg } from "node:os";
import { scenario } from "../../src/scenario";
import {
	divergenceRestoreHolds,
	recordPresence,
} from "../../src/selectionRecordCheck";
import { formatCheckReport } from "../../src/checkReport";
import type { SerializedSelectionRecord } from "../../src/types";

async function readRecord(
	page: Page,
): Promise<SerializedSelectionRecord | null> {
	return page.evaluate(() => window.__penConformance.selectionRecord);
}

scenario(
	"I4-PROBE: extra evaluates after force still hold (isolation race check)",
	async (s, page) => {
		const loads = loadavg();
		console.log(`I4-PROBE loadavg ${loads.join(" ")}`);

		await s.load("hello-world");
		await s.selectText(0, 5);
		await s.assert.selectionEquals({
			anchor: { blockId: "hello-p1", offset: 5 },
			focus: { blockId: "hello-p1", offset: 5 },
		});

		const before = await readRecord(page);
		expect(
			recordPresence(before),
			formatCheckReport(
				"I4-PROBE: selectionRecord before the force",
				before ? "passed" : "skipped",
				before ? undefined : "selectionRecord is not available",
			),
		).toBe("present");

		const forced = await s.forceUnwindowedDomDivergence();
		expect(forced.focused ? "focused" : "unfocused").toBe("focused");
		expect(forced.created ? "diverged" : "could-not-diverge").toBe(
			"diverged",
		);

		const samples: Array<{
			label: string;
			hold: ReturnType<typeof divergenceRestoreHolds>;
			compare: unknown;
			afterVersion: number | null;
		}> = [];

		async function sample(label: string): Promise<void> {
			const after = await readRecord(page);
			const compare = await page.evaluate(() =>
				window.__penConformance.domMatchesAuthority(),
			);
			const hold = divergenceRestoreHolds({
				focused: forced.focused,
				createdDivergence: forced.created,
				beforeVersion: before!.version,
				afterVersion: after?.version ?? null,
				compare,
			});
			samples.push({
				label,
				hold,
				compare,
				afterVersion: after?.version ?? null,
			});
		}

		await sample("immediate");
		await page.evaluate(() => document.querySelectorAll("*").length);
		await sample("after-dom-query");
		await page.evaluate(() => window.__penConformance.selection);
		await sample("after-selection-read");
		await page.evaluate(() => window.__penConformance.documentText);
		await sample("after-document-text");

		console.log(
			JSON.stringify(
				{
					loadavg: loads,
					beforeVersion: before!.version,
					forced,
					samples,
				},
				null,
				2,
			),
		);

		const last = samples[samples.length - 1];
		expect(
			last.hold.ok,
			formatCheckReport(
				"I4-PROBE: DOM restored and version unchanged after extra evaluates",
				last.hold.ok ? "passed" : "failed",
				`${last.hold.reason ?? ""} | samples=${JSON.stringify(samples)}`,
			),
		).toBe(true);
	},
);
