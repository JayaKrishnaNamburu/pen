---
"@input/pen-history": patch
---

Make history attribution host-authoritative so blame never treats peer-asserted presence as identity.

Without a `resolveAuthor` callback, ranges report an opaque client handle. Presence names stay on `displayHint` with `unverified: true`, so a forged awareness name cannot appear as a verified author.
