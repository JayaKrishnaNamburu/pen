---
"@input/pen-multiplayer": patch
---

Admit remote presence colors and avatar URLs only after color normalization and `pen.urlPolicy`.

CSS-injectable `user.color` values were accepted by the COL2 validator and interpolated into decoration `style` if they skipped identity-map normalization. Avatar URLs used a parallel allowlist that ignored the host `pen.urlPolicy` facet. Both now fail closed at ingest, and the decoration sink normalizes color again before writing `--pen-multiplayer-color`.
