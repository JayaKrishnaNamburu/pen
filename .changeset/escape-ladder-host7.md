---
"@input/pen-dom": patch
"@input/pen-react": patch
"@input/pen-vue": patch
---

Yield the document Escape selection ladder to capture-phase overlays (HOST7). The ladder is now a bubbling default, so a later-mounted menu or host chrome can preventDefault first instead of leaving trigger text behind as a block selection.
