export type CheckOutcome = "passed" | "failed" | "skipped";

export const STANDING_DOM_AUTHORITY_CHECK: string;
export const STANDING_DIAGNOSTICS_CHECK: string;

export function formatCheckReport(
	check: string,
	outcome: CheckOutcome,
	detail?: string,
): string;

export function formatDomAuthorityReport(result: {
	ok: boolean;
	skipped?: boolean;
	reason?: string;
}): string;

export function formatDiagnosticsReport(
	unexpected: readonly { code: string }[],
): string;
