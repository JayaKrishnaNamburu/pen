import { stripBlockAnnotations } from "@input/pen-document-ops";
import type { AIApplyStrategy } from "./contracts";
import type { AIWorkingSetEnvelope, AIWorkingSetRetrievedSpan } from "../types";

const FLOW_MARKDOWN_ALLOWED_FEATURES = [
	"paragraphs",
	"headings",
	"bullet lists",
	"ordered lists",
	"block quotes",
	"fenced code blocks",
	"GFM tables",
] as const;

export const MARKDOWN_FAST_APPLY_ROOT_TAG = "pen-fast-apply";
export const MARKDOWN_FAST_APPLY_OMISSION_MARKER =
	"<!-- ... existing markdown ... -->";

export interface FlowMarkdownPromptInput {
	prompt: string;
	workingSet: AIWorkingSetEnvelope | null;
	applyStrategy: AIApplyStrategy;
}

export function buildFlowMarkdownRequestPrompt(
	input: FlowMarkdownPromptInput,
): string {
	const contextSummary = serializeWorkingSetContext(input.workingSet);
	if (input.applyStrategy === "markdown-fast-apply") {
		return buildFlowMarkdownFastApplyPrompt(input.prompt, contextSummary);
	}
	if (input.applyStrategy === "tool-edit") {
		return buildFlowMarkdownToolEditPrompt(input.prompt, contextSummary);
	}

	return [
		"You are writing Pen flow content as markdown.",
		"Return only markdown content. Do not add commentary, JSON, or conversational lead-ins.",
		`Allowed markdown subset: ${FLOW_MARKDOWN_ALLOWED_FEATURES.join(", ")}.`,
		"Use a GFM table when the user asks for a table.",
		"Do not emit raw HTML in this lane.",
		"",
		"Context summary:",
		contextSummary,
		"",
		"User request:",
		input.prompt,
	].join("\n");
}

export function normalizeFlowMarkdownOutput(value: string): string {
	const normalized = stripBlockAnnotations(
		value.replace(/\r\n?/g, "\n").trim(),
	);
	if (!normalized.startsWith("```")) {
		return normalized;
	}
	const fencedMatch = normalized.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
	if (!fencedMatch) {
		return normalized;
	}
	return fencedMatch[1]?.trim() ?? "";
}

/**
 * The tool channel's prompt.
 *
 * Without this branch `tool-edit` fell through to the generic instructions
 * below, which tell the model to return markdown content — on this channel that
 * content is never applied (EC1), so the model was being asked for the one thing
 * that cannot become an edit. It complied, and the turn changed nothing. The
 * operation schema is the tool's own description; this says how to use it.
 */
function buildFlowMarkdownToolEditPrompt(
	prompt: string,
	contextSummary: string,
): string {
	return [
		"You are editing an existing Pen document.",
		"Make every change by calling the `edit_document` tool. Text you write is shown to the user as your reply and is never applied, so a change you only describe does not happen.",
		"The context below annotates each block with `<!-- block:<id> <type> -->`. Those ids are what your operations target. Never repeat an annotation comment inside a payload.",
		"Handle every part of the request: one operation per distinct change, all in the same call.",
		"Prefer the smallest edit that keeps a block's identity — reword a block in place rather than replacing it, and replace it only when its type has to change.",
		"Styling, colour, and emphasis go through format_text with marks; block type and block props (heading level, and so on) go through set_block_props. Text and markdown payloads are never HTML.",
		"If an operation is rejected, read the reason and the outline it returns, then call the tool again with corrected ids.",
		"",
		"Context summary:",
		contextSummary,
		"",
		"User request:",
		prompt,
	].join("\n");
}

function buildFlowMarkdownFastApplyPrompt(
	prompt: string,
	contextSummary: string,
): string {
	return [
		`You are editing existing Pen flow content using the <${MARKDOWN_FAST_APPLY_ROOT_TAG}> contract.`,
		"Return only XML. Do not return prose, markdown explanations, or code fences outside the XML payload.",
		"The context below may annotate each block with `<!-- block:<id> <type> -->`. Those ids are the block ids your edits must target. Never repeat annotation comments inside `<text>` or `<markdown>` payloads.",
		"Handle every part of the user request: a multi-part request needs one `<edit>` entry per distinct change, all in the same plan.",
		"Prefer the smallest valid edit plan that preserves existing block identity.",
		"",
		"Operations:",
		"- `replace_text`: replace the text of one block (`<text>` holds the final plain text; keep the block's type).",
		"- `append_text`: append plain text at the end of one block.",
		"- `insert_before` / `insert_after`: insert new blocks from `<markdown>` next to the target block.",
		"- `replace_blocks`: replace one or more blocks with new `<markdown>` — use this to convert a block to another type (e.g. paragraph to bullet list) or to restructure.",
		"- `delete_blocks`: remove the listed blocks.",
		"",
		"For `replace_text` you may scope the edit to part of the block: `<anchorBefore>` and `<anchorAfter>` hold exact, unique text snippets from the block, and `<text>` then replaces only what sits between them (empty anchorBefore means from the start, empty anchorAfter means to the end).",
		"",
		`Expected XML shape:`,
		`<${MARKDOWN_FAST_APPLY_ROOT_TAG}>`,
		"<instructions>I am ...</instructions>",
		"<scope>section</scope>",
		"<edit>",
		"<operation>replace_text</operation>",
		"<blockId>target-block-id</blockId>",
		"<expectedBlockType>paragraph</expectedBlockType>",
		"<text><![CDATA[Final block text]]></text>",
		"</edit>",
		"<edit>",
		"<operation>replace_blocks</operation>",
		"<block>first-block-id</block>",
		"<block>second-block-id</block>",
		"<markdown><![CDATA[- First point",
		"- Second point",
		"]]></markdown>",
		"</edit>",
		"<edit>",
		"<operation>insert_after</operation>",
		"<blockId>target-block-id</blockId>",
		"<markdown><![CDATA[| Column A | Column B |",
		"| --- | --- |",
		"| Value | Value |",
		"]]></markdown>",
		"</edit>",
		`</${MARKDOWN_FAST_APPLY_ROOT_TAG}>`,
		"",
		"Rules:",
		"- `instructions` must be a short first-person summary of the exact edit.",
		"- `scope` must be one of `single-block`, `adjacent-blocks`, or `section`.",
		"- Every edit must target block ids that appear in the context.",
		"- Use `<blockId>` for a single target or repeated `<block>` tags for multiple blocks.",
		"- `replace_text` and `append_text` use `<text>`. Structural edits use `<markdown>`.",
		`- Use ${MARKDOWN_FAST_APPLY_OMISSION_MARKER} only inside markdown when you truly need to signal omitted unchanged content.`,
		`- Allowed markdown subset: ${FLOW_MARKDOWN_ALLOWED_FEATURES.join(", ")}. Use a GFM table when the user asks for a table.`,
		"",
		"Scoped markdown context:",
		contextSummary,
		"",
		"User request:",
		prompt,
	].join("\n");
}

function serializeWorkingSetContext(
	workingSet: AIWorkingSetEnvelope | null,
): string {
	if (!workingSet) {
		return "No working set available.";
	}

	if (workingSet.source === "selection") {
		const context = workingSet.context as {
			selectedText?: string | null;
		} | null;
		return [
			"Source: selection",
			"Selected text:",
			context?.selectedText?.trim().length
				? context.selectedText
				: "(empty selection)",
		].join("\n");
	}

	if (workingSet.context && typeof workingSet.context === "object") {
		const context = workingSet.context as {
			activeBlockType?: string | null;
			selectedText?: string | null;
			markdown?: string | null;
			retrievedSpan?: AIWorkingSetRetrievedSpan | null;
			markdownWindow?: {
				blockIds?: string[];
			} | null;
			surroundingBlocks?: Array<{ type?: string }>;
		};
		const sections = [`Source: ${workingSet.source}`];
		if (context.activeBlockType) {
			sections.push(`Active block type: ${context.activeBlockType}`);
		}
		if (context.selectedText?.trim().length) {
			sections.push("Selected text:");
			sections.push(context.selectedText);
		}
		if (context.markdown?.trim().length) {
			if (context.retrievedSpan) {
				sections.push(`Retrieved span: ${context.retrievedSpan.id}`);
				sections.push(
					`Retrieved span blocks: ${context.retrievedSpan.blockIds.join(", ")}`,
				);
				if (context.retrievedSpan.headingPath.length > 0) {
					sections.push(
						`Heading path: ${context.retrievedSpan.headingPath.join(" > ")}`,
					);
				}
				sections.push(
					`Retrieval score: ${context.retrievedSpan.score} (${context.retrievedSpan.rationale})`,
				);
			} else if (context.markdownWindow?.blockIds?.length) {
				sections.push(
					`Scoped markdown blocks: ${context.markdownWindow.blockIds.join(", ")}`,
				);
			}
			sections.push("Markdown context:");
			sections.push(context.markdown);
			return sections.join("\n");
		}
		if ((context.surroundingBlocks?.length ?? 0) > 0) {
			sections.push(
				`Surrounding block types: ${context.surroundingBlocks!.map((block) => block.type ?? "unknown").join(", ")}`,
			);
		}
		return sections.join("\n");
	}

	return "Working set context could not be serialized.";
}
