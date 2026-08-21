import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	captureSelectionEvidence,
	openPlayground,
	selectEditorTextRange,
	selectNativeInlineRange,
	type SelectionEvidence,
} from "./helpers";

const PARAGRAPH = "Alpha bravo charlie delta echo";
const ARTIFACT_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"artifacts",
);

interface TimedSnapshot {
	label: string;
	evidence: SelectionEvidence;
}

/**
 * Evidence-only probe. Assertions here document capture, not engine
 * promotion. Run explicitly:
 *   pnpm exec playwright test playground/e2e/enginePromotionEvidence.spec.ts
 *
 * Never skips. Never loosens an assertion. Writes JSON so classifications
 * can be re-derived from this run rather than inherited status.
 */
test("capture authority-range projection vs untrusted addRange", async ({
	page,
	browserName,
}) => {
	await openPlayground(page);
	const firstInline = page.locator("[data-pen-inline-content]").first();
	await firstInline.click();
	await page.keyboard.type(PARAGRAPH);

	const blockId = await page
		.locator("[data-pen-editor-block]")
		.first()
		.getAttribute("data-block-id");
	expect(blockId).toBeTruthy();

	const afterType = await captureSelectionEvidence(page);

	await firstInline.click({ clickCount: 3 });
	const afterTripleClick = await captureTimedSnapshots(page, "triple-click");

	await selectEditorTextRange(
		page,
		{ blockId: blockId!, offset: 12 },
		{ blockId: blockId!, offset: 12 },
	);
	const afterCollapse = await captureSelectionEvidence(page);

	await selectEditorTextRange(
		page,
		{ blockId: blockId!, offset: 0 },
		{ blockId: blockId!, offset: PARAGRAPH.length },
	);
	const afterAuthorityRange = await captureTimedSnapshots(
		page,
		"selectTextRange",
	);

	await selectEditorTextRange(
		page,
		{ blockId: blockId!, offset: 12 },
		{ blockId: blockId!, offset: 12 },
	);

	await selectNativeInlineRange(page, blockId!, 0, PARAGRAPH.length);
	const afterUntrustedAddRange = await captureTimedSnapshots(
		page,
		"addRange",
	);

	const record = {
		capturedAt: new Date().toISOString(),
		browserName,
		concurrentPackagesLoad: true,
		paragraph: PARAGRAPH,
		blockId,
		afterType: summarize(afterType),
		afterTripleClick: afterTripleClick.map(summarizeTimed),
		afterCollapse: summarize(afterCollapse),
		afterAuthorityRange: afterAuthorityRange.map(summarizeTimed),
		afterUntrustedAddRange: afterUntrustedAddRange.map(summarizeTimed),
		classificationHints: {
			authorityRangeProjected: afterAuthorityRange.some((snap) =>
				isProjectedRange(snap.evidence, PARAGRAPH),
			),
			authorityWroteRange: afterAuthorityRange.some((snap) =>
				authorityIsRange(snap.evidence, PARAGRAPH.length),
			),
			untrustedAddRangeStuck: afterUntrustedAddRange.some((snap) =>
				isProjectedRange(snap.evidence, PARAGRAPH),
			),
			tripleClickHeldRange: afterTripleClick.some((snap) =>
				isProjectedRange(snap.evidence, PARAGRAPH),
			),
		},
	};

	mkdirSync(ARTIFACT_DIR, { recursive: true });
	const outPath = join(ARTIFACT_DIR, `${browserName}-projection.json`);
	writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
	await test.info().attach(`${browserName}-projection`, {
		body: JSON.stringify(record, null, 2),
		contentType: "application/json",
	});
});

async function captureTimedSnapshots(
	page: Page,
	label: string,
): Promise<TimedSnapshot[]> {
	const t0 = await captureSelectionEvidence(page);
	const later = await page.evaluate(async () => {
		const waitFrame = () =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => resolve());
			});
		await waitFrame();
		const afterOne = Date.now();
		await waitFrame();
		return { afterOne, afterTwo: Date.now() };
	});
	const t1 = await captureSelectionEvidence(page);
	void later;
	return [
		{ label: `${label}:t0`, evidence: t0 },
		{ label: `${label}:t2raf`, evidence: t1 },
	];
}

function authorityIsRange(
	evidence: SelectionEvidence,
	expectedLength: number,
): boolean {
	const selection = evidence.editorSelection as {
		type?: string;
		isCollapsed?: boolean;
		anchor?: { offset?: number };
		focus?: { offset?: number };
	} | null;
	if (selection?.type !== "text" || selection.isCollapsed) {
		return false;
	}
	const start = Math.min(
		selection.anchor?.offset ?? -1,
		selection.focus?.offset ?? -1,
	);
	const end = Math.max(
		selection.anchor?.offset ?? -1,
		selection.focus?.offset ?? -1,
	);
	return start === 0 && end === expectedLength;
}

function isProjectedRange(
	evidence: SelectionEvidence,
	expectedText: string,
): boolean {
	return (
		evidence.native.isCollapsed === false &&
		evidence.native.text === expectedText
	);
}

function summarize(evidence: SelectionEvidence) {
	const selection = evidence.editorSelection as {
		type?: string;
		isCollapsed?: boolean;
		anchor?: { offset?: number };
		focus?: { offset?: number };
	} | null;
	return {
		editor: {
			type: selection?.type ?? null,
			isCollapsed: selection?.isCollapsed ?? null,
			anchorOffset: selection?.anchor?.offset ?? null,
			focusOffset: selection?.focus?.offset ?? null,
		},
		native: {
			isCollapsed: evidence.native.isCollapsed,
			text: evidence.native.text,
			rangeCount: evidence.native.rangeCount,
			anchorOffset: evidence.native.anchor?.offset ?? null,
			focusOffset: evidence.native.focus?.offset ?? null,
			anchorPath: evidence.native.anchor?.nodePath ?? null,
			focusPath: evidence.native.focus?.nodePath ?? null,
		},
		activeBlockId: evidence.activeElement?.blockId ?? null,
		attachedInlineBlockId: evidence.attachedInlineBlockId,
	};
}

function summarizeTimed(snapshot: TimedSnapshot) {
	return {
		label: snapshot.label,
		...summarize(snapshot.evidence),
	};
}
