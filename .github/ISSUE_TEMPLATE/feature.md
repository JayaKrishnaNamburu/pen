---
name: Feature request
about: Propose new behavior, API, or an extension point
labels: enhancement
---

## Problem

<!-- The thing you cannot do today. Describe the use case, not the solution you have in mind. -->

## What you tried

<!--
Pen is extension-first, so a lot is reachable without changing the library:
extensions, facets, commands, and the schema. If one of those nearly works,
say where it stopped — that is usually the real feature request.
-->

## Where it belongs

- [ ] `@input/pen-core` — editor runtime, pipeline, selection
- [ ] `@input/pen-dom` — DOM rendering, input, clipboard
- [ ] An extension package
- [ ] A framework binding (React / Vue)
- [ ] Not sure

## Does it need a DOM?

<!--
Core and extensions must work without one (`createHeadlessEditor()`). A proposal
that only makes sense in a browser generally belongs in `@input/pen-dom`, and
saying so up front saves a round trip.
-->

## Styling

<!--
If this adds visible chrome, note it here. Pen is headless — it ships behavior
and state, not opinionated styling — so proposals with a built-in look need to
explain what the host can override.
-->
