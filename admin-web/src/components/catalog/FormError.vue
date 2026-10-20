<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
const props = defineProps<{ message: string }>();
const container = ref<HTMLDivElement>();
watch(
  () => props.message,
  async (value) => {
    if (value) {
      await nextTick();
      container.value?.focus();
    }
  },
);
</script>
<template>
  <div v-if="message" ref="container" class="error" role="alert" tabindex="-1">
    <strong>请检查后再保存</strong>
    <p>{{ message }}</p>
  </div>
</template>
