---
"@input/pen-multiplayer": patch
---

Stamp awareness and ledger identities as unverified display hints so a peer-asserted name cannot be treated as verified authorship.

Remote presence still publishes whatever name a peer claims, but `ClientIdentityMap` and the author ledger now drop any `verified` flag and mark the stored user `unverified: true`. `asPresenceDisplayHint` is the host-facing shape for that claim: a display hint, never an author.
