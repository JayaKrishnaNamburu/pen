/**
 * Playwright prints the `expect(value, title)` title for every assertion,
 * including passing ones. Build that title from an outcome that is already
 * known so a pass can never wear a failure sentence.
 */

/**
 * Standing DOM↔authority compares mapped caret/range points to the v1
 * selection snapshot (`anchor` / `focus` `{ blockId, offset }`).
 *
 * That is intentional and temporary: `DomScheduler.projectSelection` is a
 * reserved empty slot and is not wired into the live editor, so `affinity`
 * and `goalX` are not part of this check. Do not upgrade it to a Wave 5
 * compare until that slot is live.
 */
export const STANDING_DOM_AUTHORITY_CHECK =
	"standing: DOM vs editor.selection (v1 authority)";

export const STANDING_DIAGNOSTICS_CHECK = "standing: diagnostics-zero";

/**
 * @param {string} check
 * @param {"passed" | "failed" | "skipped"} outcome
 * @param {string} [detail]
 */
export function formatCheckReport(check, outcome, detail) {
	return detail === undefined
		? `${outcome}: ${check}`
		: `${outcome}: ${check} — ${detail}`;
}

/**
 * @param {{ ok: boolean; skipped?: boolean; reason?: string }} result
 */
export function formatDomAuthorityReport(result) {
	if (!result.ok) {
		return formatCheckReport(
			STANDING_DOM_AUTHORITY_CHECK,
			"failed",
			result.reason ?? "DOM and editor.selection disagree",
		);
	}
	if (result.skipped) {
		return formatCheckReport(
			STANDING_DOM_AUTHORITY_CHECK,
			"skipped",
			"unfocused or non-text selection",
		);
	}
	return formatCheckReport(STANDING_DOM_AUTHORITY_CHECK, "passed");
}

/**
 * @param {readonly { code: string }[]} unexpected
 */
export function formatDiagnosticsReport(unexpected) {
	if (unexpected.length === 0) {
		return formatCheckReport(STANDING_DIAGNOSTICS_CHECK, "passed");
	}
	return formatCheckReport(
		STANDING_DIAGNOSTICS_CHECK,
		"failed",
		`unexpected codes: ${unexpected.map((event) => event.code).join(", ")}`,
	);
}
