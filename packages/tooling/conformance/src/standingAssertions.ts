import { expect, type Page } from "@playwright/test";
import {
	formatDiagnosticsReport,
	formatDomAuthorityReport,
} from "./checkReport";
import type { DomAuthorityCheck } from "./types";
import {
	standingAuthorityHolds,
	unexpectedStandingDiagnostics,
} from "./standingFilter";

export {
	authorityCheckKind,
	isStandingCode,
	standingAuthorityHolds,
	unexpectedStandingDiagnostics,
} from "./standingFilter";

export async function assertStandingDiagnostics(
	page: Page,
	expectedCodes: ReadonlySet<string>,
): Promise<void> {
	const diagnostics = await page.evaluate(() => window.__penConformance.diagnostics);
	const unexpected = unexpectedStandingDiagnostics(diagnostics, expectedCodes);
	expect(unexpected, formatDiagnosticsReport(unexpected)).toEqual([]);
}

export async function assertStandingDomMatchesAuthority(
	page: Page,
): Promise<void> {
	const result = await page.evaluate(() =>
		window.__penConformance.domMatchesAuthority(),
	);
	assertDomAuthorityResult(result);
}

export function assertDomAuthorityResult(result: DomAuthorityCheck): void {
	// v1 snapshot (blockId+offset), not affinity/goalX. P1 is live in the
	// scheduler write-phase slot; affinity is still unwritten at runtime.
	// Unchecked (unfocused / non-text) is not a hold — that collapse was the skip-as-success hole.
	expect(
		standingAuthorityHolds(result),
		formatDomAuthorityReport(result),
	).toBe(true);
}
