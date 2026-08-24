---
"@input/pen-dom": patch
---

Cancel EditContext composition on Escape instead of committing it.

Chromium fires `textupdate` then `textformatupdate` in separate tasks, so the first apply is rewound when composing opens. Escape and empty `compositionend` drop the held text; a later `insertText` `textupdate` commits it.

The speculative apply stays origin `user` and the rewind stays `system`. That pair is undo-neutral: a discarded composition does not leave a user-visible undo entry. Relabeling the apply to `system` would drop ordinary EditContext undo.
