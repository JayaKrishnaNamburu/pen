# Red-proof wave — every gate must fail when executed

- GATE 99.1 [grep]: `rg -n "this-string-is-not-in-the-repo-zzzz-v3-gates" README.md`
  expect: exit 0
- GATE 99.2 [script]: `false`
  expect: exit 0
