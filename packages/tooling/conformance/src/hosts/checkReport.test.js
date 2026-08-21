import assert from "node:assert/strict";
import { test } from "node:test";
import {
	formatCheckReport,
	formatDiagnosticsReport,
	formatDomAuthorityReport,
	STANDING_DOM_AUTHORITY_CHECK,
} from "../checkReport.js";

const MISMATCH_REASON = "DOM selection does not map to a logical text selection";

test("passing DOM authority title has no failure sentence", () => {
	const title = formatDomAuthorityReport({ ok: true });
	assert.equal(title, `passed: ${STANDING_DOM_AUTHORITY_CHECK}`);
	assert.equal(
		title,
		"passed: standing: DOM vs editor.selection (v1 authority)",
	);
	assert.doesNotMatch(title, /does not match/);
	assert.doesNotMatch(title, /failed:/);
});

test("failing DOM authority title names the check and the reason", () => {
	const title = formatDomAuthorityReport({
		ok: false,
		reason: MISMATCH_REASON,
	});
	assert.equal(
		title,
		`failed: ${STANDING_DOM_AUTHORITY_CHECK} — ${MISMATCH_REASON}`,
	);
	assert.equal(
		title,
		"failed: standing: DOM vs editor.selection (v1 authority) — DOM selection does not map to a logical text selection",
	);
	assert.match(title, /^failed:/);
	assert.doesNotMatch(title, /^DOM selection does not match editor.selection/);
	assert.equal(
		formatDomAuthorityReport({ ok: false }),
		"failed: standing: DOM vs editor.selection (v1 authority) — DOM and editor.selection disagree",
	);
});

test("skipped DOM authority title is skipped, not a match or a mismatch", () => {
	const title = formatDomAuthorityReport({ ok: true, skipped: true });
	assert.equal(
		title,
		"skipped: standing: DOM vs editor.selection (v1 authority) — unfocused or non-text selection",
	);
	assert.doesNotMatch(title, /does not match/);
});

test("diagnostics-zero title says passed when the list is empty", () => {
	const title = formatDiagnosticsReport([]);
	assert.equal(title, "passed: standing: diagnostics-zero");
	assert.doesNotMatch(title, /failed/);
});

test("diagnostics-zero title names unexpected codes when it fails", () => {
	const title = formatDiagnosticsReport([{ code: "dom-divergence" }]);
	assert.equal(
		title,
		"failed: standing: diagnostics-zero — unexpected codes: dom-divergence",
	);
});

test("formatCheckReport never describes a pass as a fail", () => {
	assert.equal(formatCheckReport("example", "passed"), "passed: example");
	assert.equal(
		formatCheckReport("example", "failed", "because"),
		"failed: example — because",
	);
	assert.doesNotMatch(formatCheckReport("example", "passed"), /failed/);
});
