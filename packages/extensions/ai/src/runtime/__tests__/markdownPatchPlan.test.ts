import { describe, expect, it } from "vitest";
import { parseMarkdownPatchPlanContract } from "../markdownPatchPlan";

describe("markdown patch plan", () => {
	it("parses flow patch XML with text and markdown edits", () => {
		const plan = parseMarkdownPatchPlanContract(`
<pen-fast-apply>
  <instructions>I am updating the paragraph and inserting a heading.</instructions>
  <scope>adjacent-blocks</scope>
  <targetSpanId>span:block-1</targetSpanId>
  <edit>
    <operation>replace_text</operation>
    <blockId>block-1</blockId>
    <expectedBlockType>paragraph</expectedBlockType>
    <text><![CDATA[Updated paragraph]]></text>
  </edit>
  <edit>
    <operation>insert_after</operation>
    <blockId>block-1</blockId>
    <markdown><![CDATA[## Follow up]]></markdown>
  </edit>
</pen-fast-apply>
`);

		expect(plan).toMatchObject({
			kind: "flow_patch",
			instructions: "I am updating the paragraph and inserting a heading.",
			scope: "adjacent-blocks",
			targetSpanId: "span:block-1",
		});
		expect(plan?.edits).toHaveLength(2);
		expect(plan?.edits[0]).toMatchObject({
			operation: "replace_text",
			locator: {
				blockId: "block-1",
				expectedBlockType: "paragraph",
			},
			text: "Updated paragraph",
		});
		expect(plan?.edits[1]).toMatchObject({
			operation: "insert_after",
			locator: {
				blockId: "block-1",
			},
			markdown: "## Follow up",
		});
	});
});
