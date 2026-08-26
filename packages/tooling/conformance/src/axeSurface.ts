import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import type { AxeResults } from "axe-core";
import { AXE_INCLUDE, axeAnalyzeTags } from "./axeFormat";

export { formatAxeViolations } from "./axeFormat";

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
