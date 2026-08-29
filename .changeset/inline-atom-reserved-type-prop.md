---
"@input/pen-core": patch
---

Reject inline-atom schemas that declare a prop named `type`. Y.Text embed records use `type` as the atom discriminator and flatten props onto the same record, so that prop cannot be stored. Registration now throws at schema build time (SCH1). Hosts that declared the prop should rename it. Kept as `patch` so the 0.1.x train stays on `0.1.5`.
