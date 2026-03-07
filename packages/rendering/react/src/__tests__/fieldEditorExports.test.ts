import { describe, expect, it } from "vitest";
import {
  FieldEditorImpl,
  EditContextBackend,
  ContentEditableBackend,
  expandFieldEditorRange,
  contractFieldEditorRange,
  shouldUseBlockSelection,
  computeTextDiff,
} from "../field-editor/index.js";

describe("@pen/react field-editor exports", () => {
  it("loads the field-editor barrel on all platforms", () => {
    expect(typeof FieldEditorImpl).toBe("function");
    expect(typeof EditContextBackend).toBe("function");
    expect(typeof ContentEditableBackend).toBe("function");
    expect(typeof expandFieldEditorRange).toBe("function");
    expect(typeof contractFieldEditorRange).toBe("function");
    expect(typeof shouldUseBlockSelection).toBe("function");
  });

  it("computes a minimal text diff", () => {
    expect(computeTextDiff("Hello", "Hello world")).toEqual([
      { type: "insert", offset: 5, text: " world" },
    ]);
  });
});
