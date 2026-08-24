---
"@input/pen-ai": patch
---

Add session tool grants and turn budgets for AIB3 tool authority.

Mutating tools are default-deny unless the host allowlists them on an `AIToolTurn`. Call and op budgets end the turn with a stated reason rather than throwing, and destructive tools can go through a confirmation callback.
