---
"@input/pen-test": minor
---

Stop publishing the standalone simulateKeypress / simulateTyping helpers from the package barrel. Hosts call those methods on the TestEditor returned by createTestEditor.
