---
"@input/pen-dom": patch
---

Start a pointer selection from host chrome (FE10). A drag whose mousedown lands beside the column — the content element's padding, or the editor root next to it — now anchors at the nearest block edge (G4) and selects, across blocks or within one, instead of leaving a collapsed caret. Within one block it resolves the range itself, because a drag that never entered a field has no native range to inherit. Clicks are unchanged: a host-chrome gesture that never reached a block still finishes on the click path, so the click-outside affordance keeps owning insert-or-focus. A host asserting that a drag from the background leaves the selection untouched will now see a text selection; a marquee still requires the region-selector primitive and still respects `blockSelection={false}`.
