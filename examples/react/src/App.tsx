"use client";

import { defaultPreset } from "@input/pen";
import { PenEditor, useEditor } from "@input/pen-react";

export function App() {
  const editor = useEditor({ preset: defaultPreset() });

  return <PenEditor editor={editor} />;
}
