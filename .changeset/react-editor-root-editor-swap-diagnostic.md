---
"@input/pen-react": patch
---

Report when `Pen.Editor.Root` is handed a different editor than it mounted with.

The field editor and the DOM below a root are built for one editor instance and live as long as the component does. Passing a new `editor` prop to a mounted root left the old field editor in charge of the surface: keystrokes went nowhere and DOM selections were projected into a document that had never seen those block ids, recoverable only by reloading the page.

`EditorRoot` now emits an `editor-root-editor-replaced` diagnostic (`level: "error"`, `source: "rendering"`) naming the fix — key the root to the editor instance, for example `key={editor.internals.viewId}`, so React remounts it. Behavior is otherwise unchanged; a host that already keys its root sees nothing new.
