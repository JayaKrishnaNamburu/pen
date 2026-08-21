import { describe, expect, it } from "vitest";
import { createEditor, type PendingBlock } from "@input/pen-core";
import type { DiagnosticEvent } from "@input/pen-types";
import { createDefaultSchema } from "@input/pen-schema-default";
import {
  htmlImporter,
  parseHtmlToBlocks,
  parseHtmlWithReport,
} from "../importer";
import {
  INGEST_MAX_IMAGE_COUNT,
  INGEST_MAX_NESTING_DEPTH,
  INGEST_MAX_NODE_COUNT,
  INGEST_MAX_TEXT_SIZE,
  IngestDropCounts,
  boundPendingBlocks,
  capRawHtmlSource,
  createIngestReport,
  emitIngestReport,
  type IngestDropReason,
} from "../ingestBounds";

const noDefaultExtensionsPreset = {
  resolve() {
    return { extensions: [] };
  },
};

const defaultRegistry = createDefaultSchema();

function paragraph(
  content = "x",
  extras: Partial<PendingBlock> = {},
): PendingBlock {
  return { type: "paragraph", props: {}, content, ...extras };
}

function image(src = "https://example.com/i.png"): PendingBlock {
  return { type: "image", props: { src } };
}

function nestDepth(levels: number): PendingBlock {
  let current: PendingBlock = paragraph("leaf");
  for (let i = 1; i < levels; i += 1) {
    current = { type: "blockquote", props: {}, children: [current] };
  }
  return current;
}

function bound(blocks: readonly PendingBlock[]) {
  const drops = new IngestDropCounts();
  const kept = boundPendingBlocks(blocks, drops);
  return { kept, droppedByReason: drops.toDroppedByReason() };
}

function createBareEditor() {
  return createEditor({
    schema: defaultRegistry,
    preset: noDefaultExtensionsPreset,
  });
}

function nestedListHtml(depth: number): string {
  let html = "";
  for (let i = 0; i < depth; i += 1) {
    html += `<ul><li>d${i}`;
  }
  for (let i = 0; i < depth; i += 1) {
    html += "</li></ul>";
  }
  return html;
}

function collectDiagnostics(editor: ReturnType<typeof createBareEditor>) {
  const diagnostics: DiagnosticEvent[] = [];
  editor.on("diagnostic", (event) => {
    diagnostics.push(event);
  });
  return diagnostics;
}

describe("HTML ingest bounds leftovers (IOP5/IOP6)", () => {
  it("IOP5 keeps the node at the count cap and drops the next at a block boundary", () => {
    const blocks = Array.from({ length: INGEST_MAX_NODE_COUNT + 1 }, (_, i) =>
      paragraph(String(i)),
    );
    const { kept, droppedByReason } = bound(blocks);

    expect(kept).toHaveLength(INGEST_MAX_NODE_COUNT);
    expect(kept.at(-1)?.content).toBe(String(INGEST_MAX_NODE_COUNT - 1));
    expect(droppedByReason).toEqual([
      {
        reason: "count-exceeded",
        count: 1,
        bound: "INGEST_MAX_NODE_COUNT",
        limit: INGEST_MAX_NODE_COUNT,
        actual: INGEST_MAX_NODE_COUNT + 1,
        dropped: "1 block",
      },
    ]);
  });

  it("IOP5 counts nested children toward the node cap and reports the dropped subtree", () => {
    const overflowChild = paragraph("overflow", {
      children: [paragraph("also-dropped")],
    });
    const parent: PendingBlock = {
      type: "blockquote",
      props: {},
      children: [
        ...Array.from({ length: INGEST_MAX_NODE_COUNT - 1 }, () =>
          paragraph("kept"),
        ),
        overflowChild,
      ],
    };
    const { kept, droppedByReason } = bound([parent]);

    expect(kept).toHaveLength(1);
    expect(kept[0]?.children).toHaveLength(INGEST_MAX_NODE_COUNT - 1);
    expect(droppedByReason).toEqual([
      {
        reason: "count-exceeded",
        count: 2,
        bound: "INGEST_MAX_NODE_COUNT",
        limit: INGEST_MAX_NODE_COUNT,
        actual: INGEST_MAX_NODE_COUNT + 2,
        dropped: "2 blocks",
      },
    ]);
  });

  it("IOP5 drops list indent at the depth cap and keeps indent just under it", () => {
    const { kept, droppedByReason } = bound([
      {
        type: "bulletListItem",
        props: { indent: INGEST_MAX_NESTING_DEPTH - 1 },
        content: "ok",
      },
      {
        type: "bulletListItem",
        props: { indent: INGEST_MAX_NESTING_DEPTH },
        content: "too-deep",
        children: [paragraph("subtree")],
      },
    ]);

    expect(kept).toEqual([
      {
        type: "bulletListItem",
        props: { indent: INGEST_MAX_NESTING_DEPTH - 1 },
        content: "ok",
      },
    ]);
    expect(droppedByReason).toEqual([
      {
        reason: "depth-exceeded",
        count: 2,
        bound: "INGEST_MAX_NESTING_DEPTH",
        limit: INGEST_MAX_NESTING_DEPTH,
        actual: INGEST_MAX_NESTING_DEPTH + 1,
        dropped: "2 blocks",
      },
    ]);
  });

  it("IOP5 keeps a depth-cap chain and drops only the next nested child", () => {
    const { kept, droppedByReason } = bound([nestDepth(INGEST_MAX_NESTING_DEPTH + 1)]);

    expect(kept).toHaveLength(1);
    let node: PendingBlock | undefined = kept[0];
    let depth = 1;
    while (node?.children?.[0]) {
      node = node.children[0];
      depth += 1;
    }
    expect(depth).toBe(INGEST_MAX_NESTING_DEPTH);
    expect(node?.content).not.toBe("leaf");
    expect(droppedByReason).toEqual([
      {
        reason: "depth-exceeded",
        count: 1,
        bound: "INGEST_MAX_NESTING_DEPTH",
        limit: INGEST_MAX_NESTING_DEPTH,
        actual: INGEST_MAX_NESTING_DEPTH + 1,
        dropped: "1 block",
      },
    ]);
  });

  it("IOP5 keeps images at the cap, then keeps a following paragraph and drops only extra images", () => {
    const { kept, droppedByReason } = bound([
      ...Array.from({ length: INGEST_MAX_IMAGE_COUNT }, () => image()),
      paragraph("after-cap"),
      image("https://example.com/extra.png"),
    ]);

    expect(kept).toHaveLength(INGEST_MAX_IMAGE_COUNT + 1);
    expect(kept.at(-1)).toEqual(paragraph("after-cap"));
    expect(droppedByReason).toEqual([
      {
        reason: "image-count-exceeded",
        count: 1,
        bound: "INGEST_MAX_IMAGE_COUNT",
        limit: INGEST_MAX_IMAGE_COUNT,
        actual: INGEST_MAX_IMAGE_COUNT + 1,
        dropped: "1 image",
      },
    ]);
  });

  it("IOP5 drops an oversize following block whole rather than slicing it", () => {
    const { kept, droppedByReason } = bound([
      paragraph("x".repeat(INGEST_MAX_TEXT_SIZE)),
      paragraph("y"),
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0]?.content).toHaveLength(INGEST_MAX_TEXT_SIZE);
    expect(droppedByReason).toEqual([
      {
        reason: "text-size-exceeded",
        count: 1,
        bound: "INGEST_MAX_TEXT_SIZE",
        limit: INGEST_MAX_TEXT_SIZE,
        actual: INGEST_MAX_TEXT_SIZE + 1,
        dropped: "1 code unit",
      },
    ]);
  });

  it("IOP5 measures segment text, not leftover content, for the text-size bound", () => {
    const { kept, droppedByReason } = bound([
      {
        type: "paragraph",
        props: {},
        content: "z".repeat(INGEST_MAX_TEXT_SIZE + 80),
        segments: [{ type: "text", text: "ab" }],
      },
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0]?.segments).toEqual([{ type: "text", text: "ab" }]);
    expect(droppedByReason).toEqual([]);
  });

  it("IOP5 reports depth before image-count when both would apply", () => {
    const { kept, droppedByReason } = bound([
      {
        type: "image",
        props: { src: "https://example.com/deep.png", indent: INGEST_MAX_NESTING_DEPTH },
      },
    ]);

    expect(kept).toEqual([]);
    expect(droppedByReason).toEqual([
      {
        reason: "depth-exceeded",
        count: 1,
        bound: "INGEST_MAX_NESTING_DEPTH",
        limit: INGEST_MAX_NESTING_DEPTH,
        actual: INGEST_MAX_NESTING_DEPTH + 1,
        dropped: "1 block",
      },
    ]);
  });

  it("IOP5 truncates raw HTML at the last newline inside the text cap", () => {
    const keep = "<p>keep</p>\n";
    const input = `${keep}${"x".repeat(INGEST_MAX_TEXT_SIZE)}\n<p>lost</p>`;
    const drops = new IngestDropCounts();
    const truncated = capRawHtmlSource(input, drops);

    expect(truncated).toBe("<p>keep</p>");
    expect(drops.toDroppedByReason()).toEqual([
      {
        reason: "text-size-exceeded",
        count: input.length - truncated.length,
        bound: "INGEST_MAX_TEXT_SIZE",
        limit: INGEST_MAX_TEXT_SIZE,
        actual: input.length,
        dropped: `${input.length - truncated.length} code units`,
      },
    ]);
  });

  it("IOP6 names every drop reason in one sorted report", () => {
    const drops = new IngestDropCounts();
    const reasons: IngestDropReason[] = [
      "unknown-block-type",
      "profile-disallowed",
      "depth-exceeded",
      "count-exceeded",
      "text-size-exceeded",
      "image-count-exceeded",
      "invalid-props",
      "forbidden-key",
    ];
    for (const reason of reasons) {
      drops.add(reason);
    }

    expect(drops.toDroppedByReason().map((entry) => entry.reason)).toEqual(
      [...reasons].sort((a, b) => a.localeCompare(b)),
    );
    expect(drops.toDroppedByReason()).toEqual(
      expect.arrayContaining([
        {
          reason: "forbidden-key",
          count: 1,
          dropped: "1 own key",
        },
        {
          reason: "invalid-props",
          count: 1,
          dropped: "1 prop",
        },
        {
          reason: "count-exceeded",
          count: 1,
          bound: "INGEST_MAX_NODE_COUNT",
          limit: INGEST_MAX_NODE_COUNT,
          actual: INGEST_MAX_NODE_COUNT + 1,
          dropped: "1 block",
        },
      ]),
    );
  });

  it("IOP6 keeps droppedBlockCount at the top-level seam when only a nested child is truncated", () => {
    const drops = new IngestDropCounts();
    const kept = boundPendingBlocks(
      [nestDepth(INGEST_MAX_NESTING_DEPTH + 1)],
      drops,
    );
    const report = createIngestReport(1, kept.length, [], drops);

    expect(kept).toHaveLength(1);
    expect(report.droppedBlockCount).toBe(0);
    expect(report.normalized).toBe(true);
    expect(report.droppedByReason).toEqual([
      {
        reason: "depth-exceeded",
        count: 1,
        bound: "INGEST_MAX_NESTING_DEPTH",
        limit: INGEST_MAX_NESTING_DEPTH,
        actual: INGEST_MAX_NESTING_DEPTH + 1,
        dropped: "1 block",
      },
    ]);
  });

  it("IOP6 emits one import-truncated diagnostic for many bound drops", () => {
    const editor = createBareEditor();
    const diagnostics = collectDiagnostics(editor);
    const drops = new IngestDropCounts();
    drops.add("count-exceeded", 400);
    const report = createIngestReport(401, 1, [], drops);

    emitIngestReport(editor, report, "import-html");

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: "import-truncated",
      level: "warn",
      source: "import-html",
      message:
        "import truncated: 400 blocks count-exceeded (INGEST_MAX_NODE_COUNT) actual 10400 limit 10000",
      droppedByReason: [
        {
          reason: "count-exceeded",
          count: 400,
          bound: "INGEST_MAX_NODE_COUNT",
          limit: INGEST_MAX_NODE_COUNT,
          actual: INGEST_MAX_NODE_COUNT + 400,
          dropped: "400 blocks",
        },
      ],
    });
    editor.destroy();
  });

  it("IOP6 emits import-dropped when no bound was exceeded, and stays silent when nothing dropped", () => {
    const editor = createBareEditor();
    const diagnostics = collectDiagnostics(editor);
    const drops = new IngestDropCounts();
    drops.add("profile-disallowed", 2);
    emitIngestReport(
      editor,
      createIngestReport(3, 1, ["unknownWidget"], drops),
      "import-html",
    );
    emitIngestReport(editor, createIngestReport(0, 0, [], new IngestDropCounts()), "import-html");

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: "import-dropped",
      message: "import dropped: 2 blocks profile-disallowed",
    });
    editor.destroy();
  });

  it("IOP5/IOP6 parseHtmlWithReport drops list items past the indent cap and returns one reason", () => {
    const editor = createBareEditor();
    const { blocks, report } = parseHtmlWithReport(
      nestedListHtml(INGEST_MAX_NESTING_DEPTH + 1),
      editor,
    );

    expect(blocks).toHaveLength(INGEST_MAX_NESTING_DEPTH);
    expect(blocks.every((block) => block.type === "bulletListItem")).toBe(true);
    expect(blocks.at(-1)?.props.indent).toBe(INGEST_MAX_NESTING_DEPTH - 1);
    expect(report.droppedByReason).toEqual([
      {
        reason: "depth-exceeded",
        count: 1,
        bound: "INGEST_MAX_NESTING_DEPTH",
        limit: INGEST_MAX_NESTING_DEPTH,
        actual: INGEST_MAX_NESTING_DEPTH + 1,
        dropped: "1 block",
      },
    ]);
    editor.destroy();
  });

  it("IOP5/IOP6 parseHtmlWithReport reports the raw-source text cap without parsing the tail", () => {
    const editor = createBareEditor();
    const keep = "<p>keep</p>\n";
    const input = `${keep}${"x".repeat(INGEST_MAX_TEXT_SIZE)}\n<p>lost</p>`;
    const { blocks, report } = parseHtmlWithReport(input, editor);
    const truncated = keep.slice(0, keep.lastIndexOf("\n"));
    const droppedUnits = input.length - truncated.length;

    expect(blocks).toEqual([
      expect.objectContaining({ type: "paragraph", content: "keep" }),
    ]);
    expect(report.droppedByReason).toEqual([
      {
        reason: "text-size-exceeded",
        count: droppedUnits,
        bound: "INGEST_MAX_TEXT_SIZE",
        limit: INGEST_MAX_TEXT_SIZE,
        actual: input.length,
        dropped: `${droppedUnits} code units`,
      },
    ]);
    editor.destroy();
  });

  it("IOP6 parseHtmlToBlocks stays silent while parseHtmlWithReport carries the leftover report", () => {
    const editor = createBareEditor();
    const diagnostics = collectDiagnostics(editor);
    const html = Array.from(
      { length: INGEST_MAX_IMAGE_COUNT + 1 },
      (_, i) => `<img src="https://example.com/${i}.png" alt="${i}" />`,
    ).join("");

    const parsed = parseHtmlToBlocks(html, editor);
    const { blocks, report } = parseHtmlWithReport(html, editor);

    expect(diagnostics).toEqual([]);
    expect(parsed).toHaveLength(INGEST_MAX_IMAGE_COUNT);
    expect(blocks).toHaveLength(INGEST_MAX_IMAGE_COUNT);
    expect(report.droppedByReason).toEqual([
      {
        reason: "image-count-exceeded",
        count: 1,
        bound: "INGEST_MAX_IMAGE_COUNT",
        limit: INGEST_MAX_IMAGE_COUNT,
        actual: INGEST_MAX_IMAGE_COUNT + 1,
        dropped: "1 image",
      },
    ]);
    editor.destroy();
  });

  it("IOP6 htmlImporter.import emits one truncated report for leftover indent overflow", async () => {
    const editor = createBareEditor();
    const diagnostics = collectDiagnostics(editor);
    const result = await htmlImporter.import(
      nestedListHtml(INGEST_MAX_NESTING_DEPTH + 1),
      editor,
    );

    expect(result.droppedByReason).toEqual([
      {
        reason: "depth-exceeded",
        count: 1,
        bound: "INGEST_MAX_NESTING_DEPTH",
        limit: INGEST_MAX_NESTING_DEPTH,
        actual: INGEST_MAX_NESTING_DEPTH + 1,
        dropped: "1 block",
      },
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: "import-truncated",
      source: "import-html",
      droppedByReason: result.droppedByReason,
    });
    editor.destroy();
  });
});
