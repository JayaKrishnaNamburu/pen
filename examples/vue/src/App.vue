<script setup lang="ts">
import { createEditor } from "@input/pen";
import { PenEditor } from "@input/pen-vue";

const editor = createEditor();
</script>

<template>
  <PenEditor :editor="editor" />
</template>
