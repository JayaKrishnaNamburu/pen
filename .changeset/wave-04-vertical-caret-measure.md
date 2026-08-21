---
"@input/pen-dom": patch
---

Register G5 vertical caret geometry on `mountEditor` and stop intercepting ArrowUp/Down after the keymap.

`setVerticalCaretMeasure` now receives `verticalCaretTarget` through `measureNow`, so `pen.caretUp` / `pen.caretDown` can do visual-line motion on the framework-free host. List Tab indent lives in `commandsListTab.ts`; `commandsNavigation.ts` is gone.
