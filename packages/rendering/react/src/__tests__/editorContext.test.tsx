import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useEditorContext } from "../context/editorContext.js";

function ContextConsumer() {
  useEditorContext();
  return React.createElement("div", null, "ok");
}

describe("@pen/react editor context", () => {
  it("throws with an actionable error outside Pen.Editor.Root", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderToStaticMarkup(React.createElement(ContextConsumer))).toThrow(
      "Missing Pen.Editor.Root context",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'Pen: useEditorContext must be used within <Pen.Editor.Root>. Wrap your editor components in <Pen.Editor.Root editor={editor}>.',
    );

    errorSpy.mockRestore();
  });
});
