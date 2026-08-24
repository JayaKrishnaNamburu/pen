// @vitest-environment jsdom

import { defineExtension, ariaReadOnlyFacet } from "@input/pen-core";
import { FIELD_EDITOR_SLOT_KEY } from "@input/pen-types";
import { createTestEditor } from "@input/pen-test";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { PenEditor } from "../components/PenEditor";
import { FIELD_EDITOR_SLOT_KEY as VUE_FIELD_EDITOR_SLOT_KEY } from "../constants/fieldEditor";

afterEach(() => {
  document.body.replaceChildren();
});

describe("@input/pen-vue host surface", () => {
  it("shows the emptyPlaceholder and data-empty until the document has content", async () => {
    const editor = createTestEditor({
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "",
        },
      ],
    });

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor, emptyPlaceholder: "Start writing..." },
    });

    expect(editor.documentState.isEmpty).toBe(false);
    expect(
      wrapper.get("[data-pen-editor-root]").attributes("data-empty"),
    ).toBeUndefined();
    expect(
      wrapper.get("[data-placeholder-visible]").attributes("data-placeholder"),
    ).toBe("Start writing...");

    editor.apply(
      [
        {
          type: "splice-text",
          blockId: "paragraph-1",
          from: 0,
				to: 0,
				insert: "Hello",
        },
      ],
      { origin: "user" },
    );
    await nextTick();

    expect(wrapper.find("[data-placeholder-visible]").exists()).toBe(false);
    expect(wrapper.text()).toContain("Hello");

    wrapper.unmount();
    editor.destroy();
  });

  it("uses the messages catalog when emptyPlaceholder is omitted", () => {
    const editor = createTestEditor({
      messages: {
        "pen.schema.document.emptyPlaceholder": "Write here",
      },
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "",
        },
      ],
    });

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor },
    });

    expect(
      wrapper.get("[data-placeholder-visible]").attributes("data-placeholder"),
    ).toBe("Write here");

    wrapper.unmount();
    editor.destroy();
  });

  it("shows the schema placeholder on a focused empty heading", async () => {
    const editor = createTestEditor({
      messages: {
        "pen.schema.heading.placeholder": "Title please",
      },
      blocks: [
        {
          id: "heading-1",
          type: "heading",
          props: { level: 1 },
          content: "",
        },
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "Body",
        },
      ],
    });

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor },
    });

    const headingInline = wrapper.get(
      '[data-block-id="heading-1"] [data-pen-inline-content]',
    );
    await headingInline.trigger("mousedown");
    await headingInline.trigger("click");
    await nextTick();

    expect(headingInline.attributes("data-placeholder")).toBe("Title please");
    expect(headingInline.attributes("data-placeholder-visible")).toBe("");

    wrapper.unmount();
    editor.destroy();
  });

  it("HOST6: boolean data attributes are valueless", async () => {
    const editor = createTestEditor({
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "Hello",
        },
      ],
    });

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor, readonly: true },
    });

    expect(
      wrapper.get("[data-pen-editor-root]").attributes("data-readonly"),
    ).toBe("");

    wrapper.unmount();
    editor.destroy();
  });

  it("readonly blocks activation and checklist mutation", async () => {
    const editor = createTestEditor({
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "Locked",
        },
        {
          id: "check-1",
          type: "checkListItem",
          props: { checked: false },
          content: "Todo",
        },
      ],
    });

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor, readonly: true },
    });

    const root = wrapper.get("[data-pen-editor-root]");
    expect(root.attributes("data-readonly")).toBe("");
    expect(root.attributes("aria-readonly")).toBe("true");

    await wrapper.get("[data-pen-inline-content]").trigger("mousedown");
    await wrapper.get("[data-pen-inline-content]").trigger("click");
    await nextTick();

    expect(wrapper.find("[data-pen-field-editor-active-surface]").exists()).toBe(
      false,
    );

    await wrapper.get('input[type="checkbox"]').trigger("change");
    await nextTick();

    expect(editor.getBlock("check-1").props.checked).toBe(false);

    wrapper.unmount();
    editor.destroy();
  });

  it("AX1: pen.ariaReadOnly facet is reflected as aria-readonly", () => {
    const editor = createTestEditor({
      extensions: [
        defineExtension({
          name: "aria-readonly-ext",
          facets: [ariaReadOnlyFacet.of(true)],
        }),
      ],
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "Hello",
        },
      ],
    });

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor },
    });

    expect(wrapper.get("[data-pen-editor-root]").attributes("aria-readonly")).toBe(
      "true",
    );
    expect(
      wrapper.get("[data-pen-editor-root]").attributes("data-readonly"),
    ).toBeUndefined();

    wrapper.unmount();
    editor.destroy();
  });

  it("assigns paste importer and asset slots and clears them on unmount", () => {
    const html = {
      name: "test-html",
      mimeType: "text/html",
      import() {
        return undefined;
      },
    };
    const assets = {
      async upload() {
        return {
          id: "asset-1",
          url: "https://example.test/asset-1",
          mimeType: "image/png",
          size: 1,
        };
      },
      resolve() {
        return "https://example.test/asset-1";
      },
      async delete() {
        return undefined;
      },
    };
    const editor = createTestEditor({
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "Paste",
        },
      ],
    });

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor, importers: { html }, assets },
    });

    expect(editor.internals.getSlot(FIELD_EDITOR_SLOT_KEY)).toBeTruthy();
    expect(editor.internals.getSlot(VUE_FIELD_EDITOR_SLOT_KEY)).toBeTruthy();
    expect(editor.internals.getSlot("paste:importers")).toMatchObject({ html });
    expect(editor.internals.getSlot("paste:assetProvider")).toBe(assets);

    wrapper.unmount();

    expect(editor.internals.getSlot(FIELD_EDITOR_SLOT_KEY)).toBeUndefined();
    expect(editor.internals.getSlot(VUE_FIELD_EDITOR_SLOT_KEY)).toBeUndefined();
    expect(editor.internals.getSlot("paste:importers")).toBeUndefined();
    expect(editor.internals.getSlot("paste:assetProvider")).toBeUndefined();

    editor.destroy();
  });

  it("applies checklist and toggle updates from the default renderers", async () => {
    const editor = createTestEditor({
      blocks: [
        {
          id: "check-1",
          type: "checkListItem",
          props: { checked: false },
          content: "Todo",
        },
        {
          id: "toggle-1",
          type: "toggle",
          props: { open: false },
          content: "Section",
        },
      ],
    });

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor },
    });

    await wrapper.get('input[type="checkbox"]').trigger("change");
    await wrapper.get("[data-pen-toggle-trigger]").trigger("click");
    await nextTick();

    expect(editor.getBlock("check-1").props.checked).toBe(true);
    expect(editor.getBlock("toggle-1").props.open).toBe(true);

    wrapper.unmount();
    editor.destroy();
  });
});
