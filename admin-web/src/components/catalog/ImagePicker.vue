<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { ImagePlus, X } from "@lucide/vue";
import { imageUrls, uploadCatalogImage } from "../../storage";
import { errorMessage } from "../../catalog-model";
const props = defineProps<{
  modelValue: string[];
  label: string;
  max?: number;
  disabled?: boolean;
  resolved?: Record<string, string>;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string[]];
  busy: [value: boolean];
}>();
const urls = ref<Record<string, string>>({});
const failed=ref<Record<string,boolean>>({});
const loading = ref(false);
const progress = ref(0);
const error = ref("");
async function resolve() {
  try {
    urls.value = {
      ...urls.value,
      ...props.resolved,
      ...(await imageUrls(
        props.modelValue.filter((id) => !props.resolved?.[id]),
      )),
    };
  } catch {
    error.value = "部分图片预览暂不可用，原图片引用保留";
  }
}
onMounted(resolve);
watch(() => props.modelValue, resolve);
async function selected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  loading.value = true;
  emit("busy", true);
  error.value = "";
  progress.value = 0;
  try {
    const result = await uploadCatalogImage(file, (value) => {
      progress.value = value;
    });
    urls.value[result.fileId] = result.url;
    emit("update:modelValue", [...props.modelValue, result.fileId]);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
    emit("busy", false);
    input.value = "";
  }
}
</script>
<template>
  <div class="image-picker">
    <p class="field-label">{{ label }}</p>
    <div class="image-strip">
      <div v-for="(id, index) in modelValue" :key="id" class="image-tile">
        <img
          v-if="!failed[id] && (urls[id] || resolved?.[id])"
          :src="urls[id] || resolved?.[id]"
          :alt="`${label} ${index + 1}`"
          @error="failed[id]=true"
        /><span v-else>预览不可用</span
        ><button
          type="button"
          class="remove-image icon-button"
          :aria-label="`移除第 ${index + 1} 张图片引用`"
          :disabled="disabled || loading"
          @click="
            emit(
              'update:modelValue',
              modelValue.filter((_, i) => i !== index),
            )
          "
        >
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
      <label
        v-if="modelValue.length < (max ?? 6)"
        class="upload-tile"
        :class="{ disabled: disabled || loading }"
        ><ImagePlus :size="24" aria-hidden="true" /><span>{{
          loading ? `上传 ${progress}%` : "选择图片"
        }}</span
        ><input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          :aria-label="`上传${label}`"
          :disabled="disabled || loading"
          @change="selected"
      /></label>
    </div>
    <p class="field-hint">
      支持 PNG、JPG、WebP，每张不超过 5 MB。移除仅解除引用，保留历史素材。
    </p>
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
  </div>
</template>
