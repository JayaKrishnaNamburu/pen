import type { DomAuthorityCheck, SerializedDiagnostic } from "./types";

export type AuthorityCheckKind = "matched" | "mismatch" | "unchecked";

export function isStandingCode(code: string): boolean;
export function unexpectedStandingDiagnostics(
	diagnostics: readonly SerializedDiagnostic[],
	expectedCodes: ReadonlySet<string>,
): SerializedDiagnostic[];
export function authorityCheckKind(result: DomAuthorityCheck): AuthorityCheckKind;
export function standingAuthorityHolds(result: DomAuthorityCheck): boolean;
