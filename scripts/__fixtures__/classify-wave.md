# Classification wave — gates that cannot be checked

- GATE 97.1 [test]: hostile corpus — malformed, oversize, truncated, version-bumped, cross-document serialized anchors
  expect: exit 0
- GATE 97.2 [test]: `pnpm --filter @input/pen-conformance test -- --run an-fuzz`
  expect: exit 0
