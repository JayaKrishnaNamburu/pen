---
"@input/pen-dom": patch
---

Fix the caret briefly showing at its previous position after a mouse click in Chromium.

Clicking inside the block that already held the caret moved the caret to the old position for the whole time the button was held, then jumped it to the click point on release. Measured on a 90ms hold, the caret rendered at the stale position for 10 of the 11 frames. Clicking into a different block, or into a document with no caret yet, was unaffected — which is why it read as intermittent.

`EditContextBackend` treats a collapsed DOM selection that disagrees with the authority as a stale echo of its own `updateSelection` write and restores the authority caret. That is the right reading of a divergence nobody asked for, but it was applied unconditionally, including to the `selectionchange` the browser fires when the user clicks — the pointer window is open, the authority still holds the pre-click caret, and the two look identical to the guard. The restore beat the reader's proposal, so the DOM was dragged back to the old caret and only the pointer-settled projection put it right.

The guard now defers to gesture-window admissibility, matching `spec/rules/selection.md` R3 and the reader algorithm's step 4/5 split: with a window open the proposal is user intent and the reader owns it, so the guard stands down. It consults `isAdmissibleGestureRead()`, the same predicate the reader uses to choose between accepting and diverging, rather than approximating that decision a second time — and the same check `reconcilerFull` already uses to hold off divergence projection during a gesture. `@input/pen-react` gains a regression test covering the same-block click.

This narrows the guard to the closed-window case; it does not make that case correct. A backend that answers divergence by writing the DOM selection itself still sidesteps the projector, which S1 makes the only component allowed to write it and which P2 routes divergence through so the write is verified and a mismatch is reported. Closing that properly means replacing the restore with a divergence-projection request and folding this predicate onto the stamp-based one the projection controller already owns, which is left to the bridge redesign that `spec/rules/selection.md` and `spec/packages/rendering/dom.md` already flag.
