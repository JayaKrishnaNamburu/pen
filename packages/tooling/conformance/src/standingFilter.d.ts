import type { DomAuthorityCheck, SerializedDiagnostic } from "./types";

export function isStandingCode(code: string): boolean;
export function unexpectedStandingDiagnostics(
	diagnostics: readonly SerializedDiagnostic[],
	expectedCodes: ReadonlySet<string>,
): SerializedDiagnostic[];
export function standingAuthorityHolds(result: DomAuthorityCheck): boolean;
