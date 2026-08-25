---
"@input/pen-react": minor
---

Move AI, history, multiplayer, search, and interop from hard dependencies to optional peer dependencies.

Hosts that import `@input/pen-react/ai`, `./history`, `./multiplayer`, or `./search` must install the matching package explicitly alongside `@input/pen-react`. The core editor mount no longer pulls any of them transitively.

HTML paste needs no action from most hosts: the default importer now ships as an `html-clipboard` extension on `defaultPreset()`, and `@input/pen-preset-default` depends on `@input/pen-interop` directly. Only a host that assembles its own extension list without the preset and still wants HTML paste needs to install `@input/pen-interop` and supply the importer itself.

Hooks and primitives that used to value-import `@input/pen-ai`, `@input/pen-ai/suggestions`, `@input/pen-search`, `@input/pen-history`, or `@input/pen-multiplayer` now read the matching `@input/pen-core` facets (`aiControllerFacet`, `aiSuggestionsControllerFacet`, `searchControllerFacet`, `historyControllerFacet`, `multiplayerControllerFacet`). Type-only imports and the opt-in subpath barrels (`@input/pen-react/ai`, `./search`, `./history`, `./multiplayer`) still bind those peers.
