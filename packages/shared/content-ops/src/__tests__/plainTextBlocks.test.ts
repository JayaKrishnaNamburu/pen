import { describe, expect, it } from "vitest";
import { splitPlainTextBlocks } from "../plainTextBlocks";

describe("splitPlainTextBlocks", () => {
  it("splits single newlines into adjacent blocks", () => {
    expect(splitPlainTextBlocks("Hey\nHappy\n- Krijn")).toEqual([
      "Hey",
      "Happy",
      "- Krijn",
    ]);
  });

  it("preserves internal empty blocks from double newlines", () => {
    expect(splitPlainTextBlocks("Hey\n\nHappy\n\n- Krijn")).toEqual([
      "Hey",
      "",
      "Happy",
      "",
      "- Krijn",
    ]);
  });

  it("normalizes CRLF and CR line endings", () => {
    expect(splitPlainTextBlocks("Hey\r\nHappy\r- Krijn")).toEqual([
      "Hey",
      "Happy",
      "- Krijn",
    ]);
  });

  it("drops leading and trailing empty blocks", () => {
    expect(splitPlainTextBlocks("\n\nHey\n\nHappy\n\n")).toEqual([
      "Hey",
      "",
      "Happy",
    ]);
  });

  it("preserves multiple internal empty blocks", () => {
    expect(splitPlainTextBlocks("Hey\n\n\nHappy")).toEqual([
      "Hey",
      "",
      "",
      "Happy",
    ]);
  });

  it("trims each block", () => {
    expect(splitPlainTextBlocks("  Hey  \n  Happy  ")).toEqual([
      "Hey",
      "Happy",
    ]);
  });
});
