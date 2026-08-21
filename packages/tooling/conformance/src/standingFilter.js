import { STANDING_DIAGNOSTIC_CODES, DIAGNOSTICS_ALLOWLIST } from "./diagnosticsAllowlist.ts";

const allowlistedCodes = new Set(DIAGNOSTICS_ALLOWLIST.map((entry) => entry.code));

export function isStandingCode(code) {
	return STANDING_DIAGNOSTIC_CODES.includes(code);
}

export function unexpectedStandingDiagnostics(diagnostics, expectedCodes) {
	return diagnostics.filter((event) => {
		if (!isStandingCode(event.code)) {
			return false;
		}
		if (expectedCodes.has(event.code) || allowlistedCodes.has(event.code)) {
			return false;
		}
		return true;
	});
}

export function authorityCheckKind(result) {
	if (result.skipped === true) {
		return "unchecked";
	}
	if (result.ok === true) {
		return "matched";
	}
	return "mismatch";
}

export function standingAuthorityHolds(result) {
	return authorityCheckKind(result) === "matched";
}
