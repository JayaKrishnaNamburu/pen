import { formatCheckReport } from "./checkReport.js";

export const AXE_INCLUDE = "[data-pen-editor-root]";

export const AXE_SURFACE_TAGS = ["cat.aria", "cat.name-role-value"];

export const AXE_WCAG22_AA_TAGS = [
	"wcag2a",
	"wcag2aa",
	"wcag21a",
	"wcag21aa",
	"wcag22aa",
];

export function formatAxeViolations(violations, check = "axe") {
	if (violations.length === 0) {
		return formatCheckReport(check, "passed", "no violations");
	}
	const detail = violations
		.map((violation) => {
			const nodes = violation.nodes
				.map((node) => `    ${node.target.join(" ")} — ${node.failureSummary}`)
				.join("\n");
			return `${violation.id} (${violation.impact}): ${violation.help}\n${nodes}`;
		})
		.join("\n\n");
	return formatCheckReport(check, "failed", detail);
}

export function axeAnalyzeTags(kind) {
	switch (kind) {
		case "surface":
			return AXE_SURFACE_TAGS;
		case "wcag":
			return AXE_WCAG22_AA_TAGS;
		default:
			throw new Error(`unknown axe tag kind: ${kind}`);
	}
}
