---
"@input/pen-ai-autocomplete": minor
---

Stop re-exporting the autocomplete controller slot from the package barrel. Hosts use getAutocompleteController; the slot key lives on @input/pen-types.
