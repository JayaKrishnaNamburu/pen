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

	return [
		"You are writing Pen flow content as markdown.",
		"Return only markdown content. Do not add commentary, JSON, or conversational lead-ins.",
		`Allowed markdown subset: ${FLOW_MARKDOWN_ALLOWED_FEATURES.join(", ")}.`,
		"Use a GFM table when the user asks for a table.",
		"Do not emit raw HTML or database schemas in this lane.",
		"",
		"Context summary:",
		contextSummary,
		"",
		"User request:",
		input.prompt,
	].join("\n");
}

export function normalizeFlowMarkdownOutput(value: string): string {
	const normalized = value.replace(/\r\n?/g, "\n").trim();
	if (!normalized.startsWith("```")) {
		return normalized;
	}
	const fencedMatch = normalized.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
	if (!fencedMatch) {
		return normalized;
	}
	return fencedMatch[1]?.trim() ?? "";
}

function buildFlowMarkdownFastApplyPrompt(
	prompt: string,
	contextSummary: string,
): string {
	return [
		`You are editing existing Pen flow content using the <${MARKDOWN_FAST_APPLY_ROOT_TAG}> contract.`,
		"Return only XML. Do not return prose, markdown explanations, or code fences outside the XML payload.",
		"Use the provided block ids and retrieved span metadata as the primary locator for edits.",
		"Prefer the smallest valid edit plan that preserves existing block identity.",
		"Use `replace_text` or `append_text` for local text-only edits inside one block.",
		"Use `insert_before`, `insert_after`, or `replace_blocks` with markdown only when structure changes.",
		"",
		`Expected XML schema:`,
		`<${MARKDOWN_FAST_APPLY_ROOT_TAG}>`,
		"<instructions>I am ...</instructions>",
		"<scope>single-block</scope>",
		"<targetSpanId>span:...</targetSpanId>",
		"<edit>",
		"<operation>replace_text</operation>",
		"<blockId>target-block-id</blockId>",
		"<expectedBlockType>paragraph</expectedBlockType>",
		"<text><![CDATA[Final block text]]></text>",
		"</edit>",
		"<edit>",
		"<operation>insert_after</operation>",
		"<blockId>target-block-id</blockId>",
		"<markdown><![CDATA[## New heading",
		"",
		"New paragraph",
		"]]></markdown>",
		"</edit>",
		`</${MARKDOWN_FAST_APPLY_ROOT_TAG}>`,
		"",
		"Rules:",
		"- `instructions` must be a short first-person summary of the exact edit.",
		"- `scope` must be one of `single-block`, `adjacent-blocks`, or `section`.",
		"- Include one or more `<edit>` entries.",
		"- Each edit must use a provided block id when possible.",
		"- Use `<blockId>` for a single target or repeated `<block>` tags when replacing/deleting multiple blocks.",
		"- `replace_text` and `append_text` use `<text>`. Structural edits use `<markdown>`.",
		`- Use ${MARKDOWN_FAST_APPLY_OMISSION_MARKER} only inside markdown when you truly need to signal omitted unchanged content.`,
		"- Preserve valid Pen flow markdown. Use a GFM table when the user asks for a table.",
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
