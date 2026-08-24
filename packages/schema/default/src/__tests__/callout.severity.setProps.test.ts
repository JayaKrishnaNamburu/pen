import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { callout, createDefaultSchema } from "../index";

const noDefaultExtensionsPreset = {
  resolve() {
    return { extensions: [] };
  },
};

describe("callout severity vs set-props type", () => {
  it("names the severity prop severity, not type", () => {
    expect(callout.propSchema.severity).toBeDefined();
    expect(callout.propSchema.type).toBeUndefined();
  });

  it("set-props converts a paragraph to callout and sets severity in one op", () => {
    const editor = createEditor({
      schema: createDefaultSchema(),
      preset: noDefaultExtensionsPreset,
    });
    const blockId = editor.firstBlock()!.id;
    expect(editor.getBlock(blockId)!.type).toBe("paragraph");

    editor.apply([
      {
        type: "set-props",
        blockId,
        props: { type: "callout", severity: "warning" },
      },
    ]);

    const block = editor.getBlock(blockId)!;
    expect(block.type).toBe("callout");
    expect(block.props.severity).toBe("warning");
    editor.destroy();
  });
});
