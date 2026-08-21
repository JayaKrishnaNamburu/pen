---
"@input/pen-core": patch
---

Resolve facet definitions and providers across duplicate copies of `@input/pen-core`.

`defineFacet` kept provider records in a module-local `WeakMap` keyed on the provider object, so a provider created by one evaluation of the module was invisible to another. Any extension calling `keymapFacet.of()` against the published build while the editor was constructed from source threw `Unknown provider for facet "pen.keymap"`, even though the provider carried the right facet name.

Registry state now lives on `globalThis` under a symbol, and definitions reconcile by facet name: identity lookup stays the fast path, two evaluations in one process share one map, and two definitions of one name are accepted when they agree on `static` (a mismatch throws and names both flags). A provider that still cannot be resolved reports that two copies of `@input/pen-core` are loaded and how to deduplicate, rather than naming a facet the caller can see is registered.

This affected every `.of()` and `.compute()` call from a second core evaluation, not just keymaps. Hosts importing the editor and its extensions from a single build were never exposed; the failure surfaced in source-imported tests, bundler dedupe misses, and version skew.
