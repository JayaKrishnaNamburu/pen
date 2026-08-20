import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import type { AxeResults, Result } from "axe-core";

/**
 * AX1 / X.2 (`spec-v2/13-accessibility.md`): surface-semantics categories
 * only. Color, contrast, target-size, and the rest of WCAG 2.2 AA stay
 * on the X.7 gate (`AXE_WCAG22_AA_TAGS`).
 */
export const AXE_SURFACE_TAGS = ["cat.aria", "cat.name-role-value"] as const;

/**
 * X.7 / AX8 (`spec-v2/13-accessibility.md`): WCAG 2.2 AA rule set.
 * Includes A-level tags because AA includes A.
 */
export const AXE_WCAG22_AA_TAGS = [
	"wcag2a",
	"wcag2aa",
	"wcag21a",
	"wcag21aa",
	"wcag22aa",
] as const;

export function formatAxeViolations(violations: readonly Result[]): string {
	if (violations.length === 0) {
		return "no axe violations";
	}
	return violations
		.map((violation) => {
			const nodes = violation.nodes
				.map((node) => `    ${node.target.join(" ")} — ${node.failureSummary}`)
				.join("\n");
			return `${violation.id} (${violation.impact}): ${violation.help}\n${nodes}`;
		})
		.join("\n\n");
}

export async function analyzeEditorSurface(page: Page): Promise<AxeResults> {
	return new AxeBuilder({ page })
		.include("[data-pen-editor-root]")
		.withTags([...AXE_SURFACE_TAGS])
		.analyze();
}

export async function analyzeEditorWcag22Aa(page: Page): Promise<AxeResults> {
	return new AxeBuilder({ page })
		.include("[data-pen-editor-root]")
		.withTags([...AXE_WCAG22_AA_TAGS])
		.analyze();
}
