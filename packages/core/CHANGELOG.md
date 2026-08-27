# @input/pen-core

## 0.1.0

### Minor Changes

- a022804: First public release. The headless, extension-first editor engine for human-AI co-authoring: the `editor.apply(ops, { origin })` mutation pipeline, validation, normalization, selection, the extension manager, and the event surface. Runs without a DOM via `createHeadlessEditor`.

### Patch Changes

- e88ceeb: Remove leftover identity helpers, unused public aliases, and duplicated ingest-bound constants after the facet and empty-block migrations.
- f4e78f9: Index blockOrder membership and child-to-parent links for each normalize pass so `normalizeAll` on envelope-sized documents stays linear instead of scanning the document per block.
- Updated dependencies [e88ceeb]
- Updated dependencies [a022804]
- Updated dependencies [a022804]
  - @input/pen-types@0.1.0
  - @input/pen-yjs@0.1.0
