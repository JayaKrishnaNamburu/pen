---
"@input/pen-core": patch
"@input/pen-schema-default": patch
---

Add optional block direction and first-strong resolution helpers.

Text-capable default schemas accept an optional `direction` of `ltr`, `rtl`, or `auto`. Core adds UAX#9 P2/P3 first-strong resolution and a per-block DIR1 cache keyed by text and props. Block handles omit unset optional defaults so `direction` stays absent until authored.
