---
"@input/pen-ai": patch
---

Render the streaming edit preview for turns that have no session (EC15). The review decoration builder required an active session row, which inline-edit turns have and chat prompts do not, so a chat turn built its preview on every frame and then discarded it. The gate now identifies the owning turn from the running generation, and still ignores a preview left behind by a turn that has ended.

Also exports `AIEditStreaming` from the package types barrel, which `@input/pen-ai` re-exported without it resolving.
