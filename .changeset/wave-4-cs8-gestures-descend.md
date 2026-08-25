---
"@input/pen-dom": minor
"@input/pen-react": patch
---

Move content gestures and inline-atom interaction from @input/pen-react into @input/pen-dom

The pointer gesture controller (click, shift-click, drag-select, region select, cell select) is now `attachContentGestures` in pen-dom; the React hook is a `useEffect` that attaches it and passes `flushSync` as its synchronous-commit callback. The inline-atom wrapper, destructure and shift-click controllers, the region-selection store, and the inline-atom interaction option types moved with it. React re-exports the public types under their existing names, so its API surface is unchanged.
