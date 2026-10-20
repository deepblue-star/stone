<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { X } from "@lucide/vue";
const props = defineProps<{ title: string; busy?: boolean; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
let previous: HTMLElement | null = null;
onMounted(() => {
  previous =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  dialog.value?.showModal();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  previous?.focus();
});
function cancel(event: Event) {
  event.preventDefault();
  if (!props.busy) emit("close");
}
</script>
<template>
  <dialog
    ref="dialog"
    class="catalog-modal"
    :class="{ wide }"
    aria-labelledby="modal-title"
    @cancel="cancel"
  >
    <header class="modal-heading">
      <div>
        <p class="eyebrow">STONE / CATALOG</p>
        <h2 id="modal-title">{{ title }}</h2>
      </div>
      <button
        type="button"
        class="icon-button"
        aria-label="关闭弹窗"
        :disabled="busy"
        @click="emit('close')"
      >
        <X :size="22" aria-hidden="true" />
      </button>
    </header>
    <slot />
  </dialog>
</template>
