---
"@input/pen-search": patch
---

Match whole words with Unicode segment boundaries and fold case-insensitive queries.

Literal whole-word search now checks word-segment boundaries on both sides of each match instead of wrapping the pattern in `\b`, so Thai and accented Latin queries match real words. Case-insensitive search compares with `foldAndNormalize`; case-sensitive and regex modes are unchanged, including the SEC9 regex budget.
