import { describe, expect, it } from "vitest";
import {
	applyMarkdownFastApply,
	parseMarkdownFastApplyContract,
} from "../markdownFastApply";

describe("markdown fast apply", () => {
	it("parses the XML edit contract", () => {
		const contract = parseMarkdownFastApplyContract(`
<pen-fast-apply>
  <instructions>I am adding a table.</instructions>
  <anchorBefore><![CDATA[Intro paragraph]]></anchorBefore>
  <anchorAfter><![CDATA[## Next]]></anchorAfter>
  <patch><![CDATA[
<!-- ... existing markdown ... -->
| Name | Role |
| --- | --- |
| Alice | Design |
<!-- ... existing markdown ... -->
  ]]></patch>
</pen-fast-apply>
`);

		expect(contract?.instructions).toBe("I am adding a table.");
		expect(contract?.anchorBefore).toBe("Intro paragraph");
		expect(contract?.anchorAfter).toBe("## Next");
		expect(contract?.patch).toContain("<!-- ... existing markdown ... -->");
		expect(contract?.patch).toContain("| Name | Role |");
	});

	it("merges replacement content between unique anchors", () => {
		const contract = parseMarkdownFastApplyContract(`
<pen-fast-apply>
  <instructions>I am inserting a table after the intro.</instructions>
  <anchorBefore><![CDATA[Intro paragraph]]></anchorBefore>
  <anchorAfter><![CDATA[## Next]]></anchorAfter>
  <patch><![CDATA[
<!-- ... existing markdown ... -->

| Name | Role |
| --- | --- |
| Alice | Design |

<!-- ... existing markdown ... -->
  ]]></patch>
</pen-fast-apply>
`);

		const result = applyMarkdownFastApply({
			originalMarkdown: ["Intro paragraph", "", "## Next"].join("\n"),
			contract: contract!,
		});

		expect(result.success).toBe(true);
		expect(result.mergedMarkdown).toBe(
			["Intro paragraph", "", "| Name | Role |", "| --- | --- |", "| Alice | Design |", "", "## Next"].join("\n"),
		);
		expect(result.confidence).toBeGreaterThan(0.9);
	});

	it("falls back when anchors are ambiguous", () => {
		const contract = parseMarkdownFastApplyContract(`
<pen-fast-apply>
  <instructions>I am replacing the repeated paragraph.</instructions>
  <anchorBefore><![CDATA[Repeated line]]></anchorBefore>
  <anchorAfter><![CDATA[## Tail]]></anchorAfter>
  <patch><![CDATA[
<!-- ... existing markdown ... -->
Updated line
<!-- ... existing markdown ... -->
  ]]></patch>
</pen-fast-apply>
`);

		const result = applyMarkdownFastApply({
			originalMarkdown: ["Repeated line", "", "Repeated line", "", "## Tail"].join("\n"),
			contract: contract!,
		});

		expect(result.success).toBe(false);
		expect(result.fallbackReason).toBe("anchor-before");
		expect(result.issues[0]).toMatch(/ambiguous/i);
	});

	it("replaces an empty scoped markdown span", () => {
		const contract = parseMarkdownFastApplyContract(`
<pen-fast-apply>
  <instructions>I am creating a new table in the blank span.</instructions>
  <anchorBefore></anchorBefore>
  <anchorAfter></anchorAfter>
  <patch><![CDATA[
<!-- ... existing markdown ... -->
| Name | Role |
| --- | --- |
| Alice | Design |
<!-- ... existing markdown ... -->
  ]]></patch>
</pen-fast-apply>
`);

		const result = applyMarkdownFastApply({
			originalMarkdown: "",
			contract: contract!,
		});

		expect(result.success).toBe(true);
		expect(result.mergedMarkdown).toBe(
			["| Name | Role |", "| --- | --- |", "| Alice | Design |"].join("\n"),
		);
	});
});
