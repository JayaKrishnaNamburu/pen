import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createEditor, type PendingBlock } from "@input/pen-core";
import { createDefaultSchema } from "@input/pen-schema-default";
import { parseHtmlToBlocks } from "../importer";
import { sanitizeHTML } from "../sanitize";
import { loadPasteCorpus, loadPasteCorpusFixture } from "./pasteCorpus/loadCorpus";
import { renderPasteCorpusMarkdown } from "./pasteCorpus/renderTable";
import {
  PASTE_CORPUS_SOURCE_IDS,
  PASTE_CORPUS_SYNTHETIC_SIZE_CEILING,
  type PasteCorpusBlockExpectation,
  type PasteCorpusFixture,
} from "./pasteCorpus/types";
import {
  formatPasteCorpusProvenance,
  isSyntheticProvenance,
  validatePasteCorpusFixture,
} from "./pasteCorpus/validate";

const noDefaultExtensionsPreset = {
  resolve() {
    return { extensions: [] };
  },
};

const committedTable = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../PASTE-CORPUS.md"),
  "utf8",
);

const corpus = loadPasteCorpus();

function convertFixture(html: string): PendingBlock[] {
  const editor = createEditor({
    schema: createDefaultSchema(),
    preset: noDefaultExtensionsPreset,
  });
  try {
    return parseHtmlToBlocks(html, editor);
  } finally {
    editor.destroy();
  }
}

function countImages(blocks: PendingBlock[]): number {
  let count = 0;
  for (const block of blocks) {
    if (block.type === "image") {
      count += 1;
    }
    if (block.children) {
      count += countImages(block.children);
    }
  }
  return count;
}

function collectHrefAndSrc(value: unknown, acc: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectHrefAndSrc(item, acc);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    if (/^(href|src)$/i.test(key) && typeof nested === "string") {
      acc.push(nested);
    } else {
      collectHrefAndSrc(nested, acc);
    }
  }
}

function assertBlockStructure(
  block: PendingBlock,
  expected: PasteCorpusBlockExpectation,
): void {
  expect(block.type).toBe(expected.type);
  if (expected.text !== undefined) {
    expect(block.content ?? "").toBe(expected.text);
  }
  if (expected.level !== undefined) {
    expect(block.props.level).toBe(expected.level);
  }
  if (expected.indent !== undefined) {
    expect(block.props.indent).toBe(expected.indent);
  }
  if (expected.language !== undefined) {
    expect(block.props.language).toBe(expected.language);
  }
  if (expected.checked !== undefined) {
    expect(block.props.checked).toBe(expected.checked);
  }
  if (expected.rows !== undefined) {
    expect(block.children).toHaveLength(expected.rows);
  }
  if (expected.cols !== undefined) {
    expect(block.children?.[0]?.children).toHaveLength(expected.cols);
  }
  if (expected.hasHeaderRow !== undefined) {
    expect(block.props.hasHeaderRow).toBe(expected.hasHeaderRow);
  }
  if (expected.cells) {
    const cells = (block.children ?? []).map((row) =>
      (row.children ?? []).map((cell) => cell.content ?? ""),
    );
    expect(cells).toEqual(expected.cells);
  }
  if (expected.marks) {
    const text = block.content ?? "";
    for (const mark of expected.marks) {
      const found = (block.marks ?? []).find((candidate) => {
        if (candidate.type !== mark.type) {
          return false;
        }
        return text.slice(candidate.start, candidate.end) === mark.text;
      });
      expect(found, `missing ${mark.type} mark for "${mark.text}"`).toBeDefined();
    }
  }
}

function assertZeroProbeTrips(
  html: string,
  blocks: PendingBlock[],
): void {
  const sanitized = sanitizeHTML(html);
  expect(sanitized).not.toMatch(/<script\b/i);
  expect(sanitized).not.toMatch(/<iframe\b/i);
  expect(sanitized).not.toMatch(/javascript:/i);
  expect(sanitized).not.toMatch(/vbscript:/i);
  expect(sanitized).not.toMatch(/\son[a-z]+\s*=/i);
  const urls: string[] = [];
  collectHrefAndSrc(blocks, urls);
  for (const url of urls) {
    expect(url).not.toMatch(/^\s*javascript:/i);
    expect(url).not.toMatch(/^\s*vbscript:/i);
    expect(url).not.toMatch(/^\s*data:text\/html/i);
  }
}

describe("IOP2 paste fidelity corpus", () => {
  it.each(corpus)(
    "IOP2 $id converts to the stated structure",
    (fixture: PasteCorpusFixture) => {
      expect(fixture.expectation.id).toBe(fixture.id);
      expect(fixture.html.trim().length).toBeGreaterThan(0);
      expect(fixture.plain.trim().length).toBeGreaterThan(0);
      if (isSyntheticProvenance(fixture.expectation.provenance)) {
        expect(fixture.html.length).toBeLessThanOrEqual(
          PASTE_CORPUS_SYNTHETIC_SIZE_CEILING,
        );
      }

      const blocks = convertFixture(fixture.html);
      expect(blocks.map((block) => block.type)).toEqual(
        fixture.expectation.blocks.map((block) => block.type),
      );
      expect(blocks).toHaveLength(fixture.expectation.blocks.length);
      for (const [index, expected] of fixture.expectation.blocks.entries()) {
        assertBlockStructure(blocks[index]!, expected);
      }
      expect(countImages(blocks)).toBe(fixture.expectation.imageCount);
    },
  );

  it.each(corpus)(
    "IOP2 $id has zero SEC probe trips",
    (fixture: PasteCorpusFixture) => {
      assertZeroProbeTrips(fixture.html, convertFixture(fixture.html));
    },
  );

  it("IOP2 committed outcome table matches the generated table", () => {
    expect(committedTable).toBe(renderPasteCorpusMarkdown(corpus));
  });

  it("IOP2 harness accepts a captured provenance record so dropping in a real dump is the remaining work", () => {
    const baseline = loadPasteCorpusFixture("word-desktop");
    const fixture: PasteCorpusFixture = {
      ...baseline,
      html: "<p>from Word</p>",
      plain: "from Word",
      expectation: {
        ...baseline.expectation,
        provenance: {
          kind: "captured",
          application: "Microsoft Word",
          version: "Microsoft 365 16.89 (macOS)",
          capturedAt: "2026-08-21",
          host: "Safari 18.6",
        },
      },
    };
    expect(() => validatePasteCorpusFixture(fixture)).not.toThrow();
    expect(formatPasteCorpusProvenance(fixture.expectation.provenance)).toBe(
      "captured: Microsoft Word Microsoft 365 16.89 (macOS) (2026-08-21)",
    );
  });

  it("IOP2 harness rejects a large payload still labelled synthetic-until-capture", () => {
    const baseline = loadPasteCorpusFixture("word-desktop");
    expect(() =>
      validatePasteCorpusFixture({
        ...baseline,
        html: "x".repeat(PASTE_CORPUS_SYNTHETIC_SIZE_CEILING + 1),
      }),
    ).toThrow(/captured/);
  });

  it("IOP2 every named source has a fixture", () => {
    expect(corpus.map((fixture) => fixture.id)).toEqual([
      ...PASTE_CORPUS_SOURCE_IDS,
    ]);
  });
});
