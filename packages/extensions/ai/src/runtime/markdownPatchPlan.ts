import { MARKDOWN_FAST_APPLY_ROOT_TAG } from "./flowMarkdown";
import type { FlowPatchEdit, FlowPatchPlan } from "./planTypes";

export function parseMarkdownPatchPlanContract(value: string): FlowPatchPlan | null {
	const normalized = normalizeXml(value);
	if (
		!normalized.startsWith(`<${MARKDOWN_FAST_APPLY_ROOT_TAG}>`) ||
		!normalized.endsWith(`</${MARKDOWN_FAST_APPLY_ROOT_TAG}>`)
	) {
		return null;
	}

	const instructions = readTagContent(normalized, "instructions");
	const edits = readRepeatedTagContents(normalized, "edit")
		.map((editSource) => parseEdit(editSource))
		.filter((edit): edit is FlowPatchEdit => edit !== null);
	if (!instructions || edits.length === 0) {
		return null;
	}

	const scope = readTagContent(normalized, "scope");
	const targetSpanId = readTagContent(normalized, "targetSpanId");

	return {
		kind: "flow_patch",
		instructions: instructions.trim(),
		scope:
			scope === "single-block" ||
			scope === "adjacent-blocks" ||
			scope === "section"
				? scope
				: undefined,
		targetSpanId: targetSpanId?.trim() || undefined,
		edits,
	};
}

function parseEdit(source: string): FlowPatchEdit | null {
	const operation = readTagContent(source, "operation");
	if (
		operation !== "replace_text" &&
		operation !== "append_text" &&
		operation !== "insert_before" &&
		operation !== "insert_after" &&
		operation !== "replace_blocks" &&
		operation !== "delete_blocks"
	) {
		return null;
	}

	const blockId = readTagContent(source, "blockId")?.trim();
	const blockIds = readRepeatedTagContents(source, "block").map((value) => value.trim());
	const expectedBlockType = readTagContent(source, "expectedBlockType")?.trim();
	const retrievedSpanId = readTagContent(source, "retrievedSpanId")?.trim();
	const anchorBefore = readTagContent(source, "anchorBefore") ?? undefined;
	const anchorAfter = readTagContent(source, "anchorAfter") ?? undefined;
	const text = readTagContent(source, "text") ?? undefined;
	const markdown = readTagContent(source, "markdown") ?? undefined;

	return {
		operation,
		locator: {
			blockId: blockId || undefined,
			blockIds: blockIds.length > 0 ? blockIds : undefined,
			retrievedSpanId: retrievedSpanId || undefined,
			expectedBlockType: expectedBlockType || undefined,
			anchorBefore,
			anchorAfter,
		},
		text,
		markdown,
	};
}

function normalizeXml(value: string): string {
	return value.replace(/\r\n?/g, "\n").trim();
}

function readRepeatedTagContents(source: string, tagName: string): string[] {
	const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "gi");
	return [...source.matchAll(pattern)]
		.map((match) => match[1] ?? "")
		.filter((value) => value.length > 0)
		.map((value) => unwrapCdata(value.trim()));
}

function readTagContent(source: string, tagName: string): string | null {
	const match = source.match(
		new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"),
	);
	if (!match?.[1]) {
		return null;
	}
	return unwrapCdata(match[1].trim());
}

function unwrapCdata(value: string): string {
	const cdata = value.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
	return cdata?.[1] ?? value;
}
