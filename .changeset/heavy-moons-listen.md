---
"@input/pen-dom": patch
---

Fix collaborator carets staying pinned in place while the document scrolls.

`GeometryReader` caches caret and range rects per block, keyed by the block's commit id plus the viewport-resize and font-load generations (G2). Those rects come from `Range.getClientRects()` and `getBoundingClientRect()`, so they are viewport-relative — and scrolling changed none of the three key parts. After a scroll the reader kept returning the coordinates measured before it, and overlays that paint at those coordinates stayed where they were. `Pen.Multiplayer.CaretOverlay` showed this most clearly: a peer's caret and name label sat at a fixed spot on screen while their block moved away underneath. `Pen.Editor.CaretOverlay` and the selection-rect overlay read through the same cache and drifted the same way.

The G2 key now carries a scroll generation, bumped by a capture-phase `scroll` listener on the root's document — capture because `scroll` does not bubble, and a scroller nested inside the editor moves cached rects just as an ancestor one does. A scroll in a container that neither contains nor is contained by the root cannot move the root, so it leaves the cache warm. `GeometryReaderOptions.observeScroll` opts out, alongside the existing `observeResize` and `observeFonts`.

`dispose()` removes the listener, and because nothing calls `dispose()` in production today the listener also drops itself the first time it fires with a disconnected root. A document-level listener that only waited for `dispose()` would keep every unmounted editor root and its cache reachable.
