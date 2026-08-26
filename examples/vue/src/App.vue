<script setup lang="ts">
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { PenEditor } from "@input/pen-vue";

const editor = createEditor({
  preset: defaultPreset(),
});
</script>

<template>
  <PenEditor :editor="editor" />
</template>
