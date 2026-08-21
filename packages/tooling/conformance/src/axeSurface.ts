import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import type { AxeResults } from "axe-core";
import { AXE_INCLUDE, axeAnalyzeTags } from "./axeFormat";

export {
	AXE_INCLUDE,
	AXE_SURFACE_TAGS,
	AXE_WCAG22_AA_TAGS,
	axeAnalyzeTags,
	formatAxeViolations,
} from "./axeFormat";

export async function analyzeEditorSurface(page: Page): Promise<AxeResults> {
	return new AxeBuilder({ page })
		.include(AXE_INCLUDE)
		.withTags([...axeAnalyzeTags("surface")])
		.analyze();
}

export async function analyzeEditorWcag22Aa(page: Page): Promise<AxeResults> {
	return new AxeBuilder({ page })
		.include(AXE_INCLUDE)
		.withTags([...axeAnalyzeTags("wcag")])
		.analyze();
}
