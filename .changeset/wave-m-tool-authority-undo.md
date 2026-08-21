---
"@input/pen-ai": patch
"@input/pen-ai-tools": patch
"@input/pen-ai-suggestions": patch
"@input/pen-ai-autocomplete": patch
"@input/pen-delta-stream": patch
"@input/pen-test": patch
---

Wire AIB3 tool authority through the agentic loop and thread AIB4 undo group ids across generation, tool applies, streamed applies, suggestion accept, and autocomplete accept.

A hostile model double that requests 100 mutating calls in one turn is default-denied except for the host allowlist, the call budget ends the turn with a reason, and one undo reverts the permitted writes. `createAIToolTurn` can carry a `groupId` so metered `editor.apply` calls share that group. Generation writes that previously used the untracked `extension` origin now use `ai-session` so they land on the undo stack. Hosts that relied on default-allow mutating tools must now pass `allowedMutatingTools`.
