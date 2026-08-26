import { describe, expect, it } from "vitest";
import { splitPlainTextLineBlocks } from "../plainTextBlocks";

describe("splitPlainTextLineBlocks", () => {
  it("splits single newlines into adjacent blocks", () => {
    expect(splitPlainTextLineBlocks("Hey\nHappy\n- Krijn")).toEqual([
      "Hey",
      "Happy",
      "- Krijn",
    ]);
  });

  it("preserves internal empty blocks from double newlines", () => {
    expect(splitPlainTextLineBlocks("Hey\n\nHappy\n\n- Krijn")).toEqual([
      "Hey",
      "",
      "Happy",
      "",
      "- Krijn",
    ]);
  });

  it("normalizes CRLF and CR line endings", () => {
    expect(splitPlainTextLineBlocks("Hey\r\nHappy\r- Krijn")).toEqual([
      "Hey",
      "Happy",
      "- Krijn",
    ]);
  });

  it("drops leading and trailing empty blocks", () => {
    expect(splitPlainTextLineBlocks("\n\nHey\n\nHappy\n\n")).toEqual([
      "Hey",
      "",
      "Happy",
    ]);
  });

  it("preserves multiple internal empty blocks", () => {
    expect(splitPlainTextLineBlocks("Hey\n\n\nHappy")).toEqual([
      "Hey",
      "",
      "",
      "Happy",
    ]);
  });

  it("trims each block", () => {
    expect(splitPlainTextLineBlocks("  Hey  \n  Happy  ")).toEqual([
      "Hey",
      "Happy",
    ]);
  });
});
