import type { Result } from "axe-core";

export const AXE_INCLUDE: string;
export const AXE_SURFACE_TAGS: readonly string[];
export const AXE_WCAG22_AA_TAGS: readonly string[];
export function formatAxeViolations(
	violations: readonly Result[],
	check?: string,
): string;
export function axeAnalyzeTags(kind: "surface" | "wcag"): readonly string[];
