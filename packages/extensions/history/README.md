# @input/pen-history

Snapshot history and attribution primitives for Pen

## Install

```bash
pnpm add @input/pen-history
```

## COL3: `resolveAuthor` is host-authoritative

Yjs records only a numeric `clientId`. That is an opaque session number — not a user, not stable across reloads, and not attributable on its own.

The host resolver is authoritative. `getCharacterAttribution` and `getBlameRanges` resolve identity through `resolveAuthor` (`clientId` → author). Pen stamps `verified: true` on that result. Presence names never become `author` and are not stored on a snapshot.

Peer-asserted presence stays on `displayHint` (`unverified: true`). That field is an unverified display hint (a live cursor label), not authorship.

Pass the resolver on `historyExtension`:

```ts
import { historyExtension } from "@input/pen-history";

historyExtension({
  persistence,
  docId: "doc-1",
  resolveAuthor(clientId) {
    const user = usersByClientId.get(clientId);
    if (!user) return null;
    return { id: user.id, name: user.name, color: user.color };
  },
});
```

`resolveAuthor` is the attribution trust boundary. Return only identities the host has verified (session, auth token, or user table).

- **Resolver returns an identity:** `author` is that identity (`verified: true`).
- **No resolver, or the resolver returns null:** `author` is an opaque client handle (`verified: false`, `name: "User 77"`, `clientId: 77`). Never a peer-supplied display name.
- **Presence:** `displayHint` only. Do not render it as authorship.

An unnamed author is honest; a forgeable name is not.

## Notes

This package is part of the Pen monorepo. Pair it with the relevant core, schema, rendering, or extension packages for your editor setup.
