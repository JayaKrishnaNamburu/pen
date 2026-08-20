import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { jsonImporter, parseJsonDocument } from "../importer";
import { defaultSchema } from "@input/pen-schema-default";

const noDefaultExtensionsPreset = {
  resolve() {
    return { extensions: [] };
  },
};

function createBareEditor() {
  const editor = createEditor({
    schema: defaultSchema, preset: noDefaultExtensionsPreset,
  });
  const existingBlockIds = [...editor.documentState.allBlocks()]
    .filter((handle) => handle.parent === null)
    .map((handle) => handle.id);
  if (existingBlockIds.length > 0) {
    editor.apply(
      existingBlockIds.reverse().map((blockId) => ({
        type: "delete-block" as const,
        blockId,
      })),
    );
  }
  return editor;
}

// Built as a string so `__proto__` is an own key, not a prototype setter.
function hostileDocumentJson(): string {
  return [
    "{",
    '"version":1,',
    '"metadata":{"safe":"kept","__proto__":{"polluted":true}},',
    '"blocks":[{',
    '"id":"h1",',
    '"type":"heading",',
    '"props":{"level":1,"safe":"kept","__proto__":{"polluted":true},"constructor":{"polluted":true},"prototype":{"polluted":true}},',
    '"content":{"text":"Kept","marks":[{"type":"bold","start":0,"end":4,"props":{"__proto__":{"polluted":true}}}]}',
    "}]}",
  ].join("");
}

describe("SEC4 JSON import proto keys", () => {
  it("SEC4: rejects __proto__, constructor, and prototype own keys", () => {
    const document = parseJsonDocument(hostileDocumentJson());
    const [block] = document.blocks;

    expect(Object.getPrototypeOf(document)).toBeNull();
    expect(Object.getPrototypeOf(block?.props)).toBeNull();
    expect(Object.hasOwn(block?.props ?? {}, "__proto__")).toBe(false);
    expect(Object.hasOwn(block?.props ?? {}, "constructor")).toBe(false);
    expect(Object.hasOwn(block?.props ?? {}, "prototype")).toBe(false);
    expect(block?.props).toEqual({ level: 1, safe: "kept" });
    expect(Object.hasOwn(document.metadata ?? {}, "__proto__")).toBe(false);
    expect(Object.hasOwn(block?.content?.marks?.[0]?.props ?? {}, "__proto__")).toBe(
      false,
    );
    expect(
      (Object.prototype as { polluted?: boolean }).polluted,
    ).toBeUndefined();
  });

  it("SEC4: proto-key JSON import does not pollute and keeps safe fields", async () => {
    const editor = createBareEditor();

    await jsonImporter.import(hostileDocumentJson(), editor);

    const block = editor.getBlock("h1");
    expect(block).not.toBeNull();
    expect(block?.textContent()).toBe("Kept");
    expect(Object.hasOwn(block?.props ?? {}, "__proto__")).toBe(false);
    expect(Object.hasOwn(block?.props ?? {}, "constructor")).toBe(false);
    expect(Object.hasOwn(block?.props ?? {}, "prototype")).toBe(false);
    expect(block?.props).toMatchObject({ level: 1 });
    expect(
      (Object.prototype as { polluted?: boolean }).polluted,
    ).toBeUndefined();

    editor.destroy();
  });
});
