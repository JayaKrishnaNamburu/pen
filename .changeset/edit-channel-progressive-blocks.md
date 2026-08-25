---
"@input/pen-ai": minor
---

Write an `insert_blocks` payload's completed blocks while its call is still streaming (EC20). The inline preview could show the words but not the structure — a heading, a paragraph, and a list all previewed as lines inside whichever block they were anchored to, and only became blocks when the call landed. A blank line outside a code fence now marks a block as final, and those blocks are written through the same converter the tool uses; the closing call applies only the tail it has not seen written. Anything that ends the call without landing it — abort, error, truncation, a stale or denied result — removes what was written, the suggestions posture stages early writes the way it stages the call's own, and a turn with a confirmation resolver writes nothing before the answer.
