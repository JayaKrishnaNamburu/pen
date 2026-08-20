import { expect, type Page } from "@playwright/test";
import {
	DIAGNOSTICS_ALLOWLIST,
	STANDING_DIAGNOSTIC_CODES,
} from "./diagnosticsAllowlist";
import type { DomAuthorityCheck, SerializedDiagnostic } from "./types";

const allowlistedCodes = new Set<string>(
	DIAGNOSTICS_ALLOWLIST.map((entry) => entry.code),
);

export async function assertStandingDiagnostics(
	page: Page,
	expectedCodes: ReadonlySet<string>,
): Promise<void> {
	const diagnostics = await page.evaluate(() => window.__penConformance.diagnostics);
	const unexpected = diagnostics.filter((event: SerializedDiagnostic) => {
		if (!isStandingCode(event.code)) {
			return false;
		}
		if (expectedCodes.has(event.code) || allowlistedCodes.has(event.code)) {
			return false;
		}
		return true;
	});
	expect(
		unexpected,
		`standing diagnostics-zero failed: ${unexpected
			.map((event) => event.code)
			.join(", ")}`,
	).toEqual([]);
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
	expect(
		result.ok,
		result.reason ?? "DOM selection does not match editor.selection",
	).toBe(true);
}

function isStandingCode(code: string): boolean {
	return (STANDING_DIAGNOSTIC_CODES as readonly string[]).includes(code);
}
