---
"@input/pen-dom": patch
---

Attach the restored inline and write the caret synchronously after a history restore, and activate the nearest block when clicking below the last one.

`_syncBackendForSurfaceMode` returned early when the backend class was unchanged
(single paragraph to single paragraph), so after a history restore the new
inline was never attached during that turn. Chromium moved the native caret on
attach anyway and WebKit caught up via the existing projector, but Firefox left
`window.getSelection()` on the previous block indefinitely while
`editor.selection` and `document.activeElement` were both correct. The restored
inline is now attached and the projection completed synchronously, with no new
timer or retry.

Clicking the editor root, content, or blocks host below the last block (or above
the first) now activates that block at its end or start. Clicks between blocks
stay inactive as before. A host that gives the editor root a height taller than
its content no longer has a dead zone.
