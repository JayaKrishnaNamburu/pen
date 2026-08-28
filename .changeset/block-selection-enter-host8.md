---
"@input/pen-dom": patch
"@input/pen-react": patch
"@input/pen-vue": patch
---

Yield block-selection Enter to the host (HOST8) and keep DOM focus on the editor sink while a block or cell is selected (HOST9). Enter is now a bubbling default like Escape, so a listener on the editor element can preventDefault first; hosts that relied on document-capture Enter will see the key reach the subtree. Focus is parked on the sink in the same selectionChange turn so two composers in one document no longer race for a body-targeted Enter.
