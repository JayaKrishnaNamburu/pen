"use client";

import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { PenEditor } from "@input/pen-react";

const editor = createEditor({
  preset: defaultPreset(),
});

export function App() {
  return <PenEditor editor={editor} />;
}
