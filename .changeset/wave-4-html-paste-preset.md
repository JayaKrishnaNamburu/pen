---
"@input/pen-react": minor
"@input/pen-preset-default": minor
---

Move the default HTML paste importer from `@input/pen-react` into `@input/pen-preset-default`.

`PenEditor` / `EditorRoot` no longer import `@input/pen-interop`. A host that uses `defaultPreset()` still gets HTML paste with no code change. A host on bare `createEditor()` plus `PenEditor` does not get HTML paste unless they pass `importers.html` (or install the preset). Host-supplied importer tables still win, including partial ones: `{ markdown }` keeps the preset HTML importer.

`DefaultPresetOptions` gains `htmlClipboard?: boolean`, matching the existing `documentOps` / `deltaStream` / `undo` / `shortcuts` opt-outs. Pass `htmlClipboard: false` to assemble the preset without the HTML paste default.
