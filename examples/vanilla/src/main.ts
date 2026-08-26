import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { mountEditor } from "@input/pen-dom";

const editor = createEditor({
  preset: defaultPreset(),
});

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) {
  throw new Error("Missing #app");
}

mountEditor(editor, root);
