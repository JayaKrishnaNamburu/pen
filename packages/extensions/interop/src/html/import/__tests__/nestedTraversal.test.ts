import { describe, expect, it } from "vitest";
import { createDefaultSchema } from "@input/pen-schema-default";
import { parseHTML } from "../domAdapter";
import { domToBlocks } from "../domToBlocks";
import { sanitizeHTML } from "../sanitize";

const defaultRegistry = createDefaultSchema();

const MARKERS = {
  toggleTitle: "TOGGLE-TITLE",
  toggleChild: "NESTED-TOGGLE-CHILD",
  calloutTitle: "CALLOUT-TITLE",
  calloutChild: "NESTED-CALLOUT-CHILD",
} as const;

function convert(html: string) {
  return domToBlocks(parseHTML(sanitizeHTML(html)), defaultRegistry);
}

describe("HTML import nested traversal", () => {
  it("attaches remaining details children under the toggle, not drops them", () => {
    const blocks = convert(
      `<details><summary>${MARKERS.toggleTitle}</summary>` +
        `<p>${MARKERS.toggleChild}</p></details>`,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "toggle",
      content: MARKERS.toggleTitle,
    });
    expect(blocks[0]?.children).toEqual([
      expect.objectContaining({
        type: "paragraph",
        content: MARKERS.toggleChild,
      }),
    ]);
  });

  it("attaches remaining callout children instead of flattening them into the title", () => {
    const blocks = convert(
      `<div class="callout callout-info">${MARKERS.calloutTitle}` +
        `<p>${MARKERS.calloutChild}</p></div>`,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "callout",
      content: MARKERS.calloutTitle,
    });
    expect(blocks[0]?.children).toEqual([
      expect.objectContaining({
        type: "paragraph",
        content: MARKERS.calloutChild,
      }),
    ]);
  });
});
