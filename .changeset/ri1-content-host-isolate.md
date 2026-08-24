---
"@input/pen-dom": patch
"@input/pen-react": patch
"@input/pen-vue": patch
---

Set `unicode-bidi: isolate` on block and inline content hosts so each block is a bidi isolate (RI1)

`unicode-bidi` does not inherit, so isolating the block host leaves the inline
surface inside it computing as `normal`. Every host that already receives `dir`
now receives `isolate` alongside it, in all three renderers, and so does the
inline surface it wraps. Table cells are covered individually rather than
through their table.
