---
"@input/pen-schema-default": patch
---

Escape document values in default schema HTML serializers.

Stored href, color, lang, label, and other attribute interpolations now go through a shared helper so breakout strings cannot leave the attribute in exported markup.
