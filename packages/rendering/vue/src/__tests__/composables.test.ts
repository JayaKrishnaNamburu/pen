// @vitest-environment jsdom

import { a11yLabelFacet } from "@input/pen-core";
import { createTestEditor } from "@input/pen-test";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { useBlockList, useDecorations, useEditor, useSelection } from "../index";

afterEach(() => {
  document.body.replaceChildren();
});

describe("@input/pen-vue composables", () => {
  it("useEditor creates an owned editor and destroys it when the scope ends", async () => {
    let owned: ReturnType<typeof useEditor> | undefined;

    const Harness = defineComponent({
      setup() {
        owned = useEditor({ a11yLabel: "Compose" });
        return () => h("div");
      },
    });

    const wrapper = mount(Harness);
    expect(owned).toBeDefined();
    expect(owned?.facet(a11yLabelFacet)).toBe("Compose");
    expect(typeof owned?.apply).toBe("function");
    expect(owned?.documentState.blockCount).toBeGreaterThan(0);

    wrapper.unmount();
    await owned!.destroy();

    expect(owned!.documentState.blockOrder).toEqual([]);
  });

  it("useEditor wraps a host editor and leaves it intact on unmount", async () => {
    const editor = createTestEditor({
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "Keep me",
        },
      ],
    });

    const Harness = defineComponent({
      setup() {
        const resolved = useEditor(editor);
        expect(resolved).toBe(editor);
        return () => h("div");
      },
    });

    const wrapper = mount(Harness);
    wrapper.unmount();

    editor.apply(
      [
        {
          type: "splice-text",
          blockId: "paragraph-1",
          from: 7,
				to: 7,
				insert: "!",
        },
      ],
      { origin: "user" },
    );

    expect(editor.getBlock("paragraph-1").textContent()).toBe("Keep me!");

    editor.destroy();
  });

  it("useSelection, useBlockList, and useDecorations require PenEditor context", () => {
    const cases = [
      ["useSelection", useSelection],
      ["useBlockList", useBlockList],
      ["useDecorations", useDecorations],
    ] as const;

    for (const [, composable] of cases) {
      let thrown: unknown;
      const Harness = defineComponent({
        setup() {
          try {
            composable();
          } catch (error) {
            thrown = error;
          }
          return () => h("div");
        },
      });

      mount(Harness).unmount();
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe("Missing PenEditor context");
    }
  });
});
