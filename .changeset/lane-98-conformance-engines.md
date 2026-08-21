---
---

Stop the F39 passive-block history scenario from depending on Chromium mouse-drag timing.

The port had dragged a multi-block range and relied on the undo-manager capture timeout to split stack items. That is the original selectedTextDeletion.20 behavior only by accident: the jsdom case edited one block and mutated another. The scenario now activates a single-block caret and calls `stopCapturing` at each history boundary so undo/redo of the passive block is engine-independent.
