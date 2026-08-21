// @vitest-environment jsdom

import {
  blockDirectionFacet,
  defaultDirectionFacet,
  defineExtension,
  resolveBlockDirection,
} from "@input/pen-core";
import { createTestEditor } from "@input/pen-test";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { PenEditor } from "../components/PenEditor";

afterEach(() => {
  document.body.replaceChildren();
});

function mountEditor(
  editor: ReturnType<typeof createTestEditor>,
) {
  return mount(PenEditor, {
    attachTo: document.body,
    props: { editor },
  });
}

function hostDir(
  wrapper: ReturnType<typeof mountEditor>,
  blockId: string,
): string | undefined {
  return wrapper.get(`[data-block-id="${blockId}"]`).attributes("dir");
}

describe("Vue DIR1 resolved host dir", () => {
  it("DIR1: LTR text with no facet and no prop omits dir", () => {
    const editor = createTestEditor({
      blocks: [
        {
          id: "paragraph-ltr",
          type: "paragraph",
          props: {},
          content: "Hello",
        },
      ],
    });
    const wrapper = mountEditor(editor);
    const block = editor.getBlock("paragraph-ltr");

    expect(resolveBlockDirection(editor, block)).toBe("ltr");
    expect(hostDir(wrapper, "paragraph-ltr")).toBeUndefined();
    expect(wrapper.html()).not.toContain('dir="auto"');

    wrapper.unmount();
    editor.destroy();
  });

  it("DIR1: pen.blockDirection resolver changes rendered dir", () => {
    const editor = createTestEditor({
      blocks: [
        {
          id: "paragraph-latin",
          type: "paragraph",
          props: {},
          content: "Hello",
        },
      ],
      extensions: [
        defineExtension({
          name: "dir-facet",
          facets: [blockDirectionFacet.of(() => "rtl")],
        }),
      ],
    });
    const wrapper = mountEditor(editor);
    const block = editor.getBlock("paragraph-latin");

    expect(resolveBlockDirection(editor, block)).toBe("rtl");
    expect(hostDir(wrapper, "paragraph-latin")).toBe("rtl");

    wrapper.unmount();
    editor.destroy();
  });

  it("DIR1: explicit props.direction wins over pen.blockDirection", () => {
    const editor = createTestEditor({
      blocks: [
        {
          id: "paragraph-explicit",
          type: "paragraph",
          props: { direction: "ltr" },
          content: "Hello",
        },
      ],
      extensions: [
        defineExtension({
          name: "dir-facet",
          facets: [blockDirectionFacet.of(() => "rtl")],
        }),
      ],
    });
    const wrapper = mountEditor(editor);
    const block = editor.getBlock("paragraph-explicit");

    expect(resolveBlockDirection(editor, block)).toBe("ltr");
    expect(hostDir(wrapper, "paragraph-explicit")).toBe("ltr");

    wrapper.unmount();
    editor.destroy();
  });

  it("DIR1: first-strong RTL text with no prop and no resolver renders RTL", () => {
    const editor = createTestEditor({
      blocks: [
        {
          id: "paragraph-arabic",
          type: "paragraph",
          props: {},
          content: "مرحبا",
        },
      ],
    });
    const wrapper = mountEditor(editor);
    const block = editor.getBlock("paragraph-arabic");

    expect(resolveBlockDirection(editor, block)).toBe("rtl");
    expect(hostDir(wrapper, "paragraph-arabic")).toBe("rtl");
    expect(
      wrapper
        .get('[data-block-id="paragraph-arabic"] [data-pen-inline-content]')
        .attributes("dir"),
    ).toBeUndefined();

    wrapper.unmount();
    editor.destroy();
  });

  it("DIR1: pen.defaultDirection applies when nothing else does", () => {
    const editor = createTestEditor({
      blocks: [
        {
          id: "paragraph-digits",
          type: "paragraph",
          props: {},
          content: "12345",
        },
      ],
      extensions: [
        defineExtension({
          name: "dir-default",
          facets: [defaultDirectionFacet.of("rtl")],
        }),
      ],
    });
    const wrapper = mountEditor(editor);
    const block = editor.getBlock("paragraph-digits");

    expect(resolveBlockDirection(editor, block)).toBe("rtl");
    expect(hostDir(wrapper, "paragraph-digits")).toBe("rtl");

    wrapper.unmount();
    editor.destroy();
  });

  it("DIR1: host dir tracks cache invalidation when block text changes", async () => {
    const editor = createTestEditor({
      blocks: [
        {
          id: "paragraph-flip",
          type: "paragraph",
          props: {},
          content: "مرحبا",
        },
      ],
    });
    const wrapper = mountEditor(editor);
    expect(hostDir(wrapper, "paragraph-flip")).toBe("rtl");

    editor.apply([
      {
        type: "replace-text",
        blockId: "paragraph-flip",
        offset: 0,
        length: editor.getBlock("paragraph-flip").length(),
        text: "Hello",
      },
    ]);
    await nextTick();

    expect(
      resolveBlockDirection(editor, editor.getBlock("paragraph-flip")),
    ).toBe("ltr");
    expect(hostDir(wrapper, "paragraph-flip")).toBeUndefined();

    wrapper.unmount();
    editor.destroy();
  });
});
