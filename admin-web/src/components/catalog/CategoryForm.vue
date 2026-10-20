<script setup lang="ts">
import { ref } from "vue";
import type {
  AdminCategory,
  CatalogType,
} from "../../../../packages/contracts/src/catalog";
import { api } from "../../platform";
import { catalogLabels, errorMessage } from "../../catalog-model";
import Modal from "./Modal.vue";
import FormError from "./FormError.vue";
const props = defineProps<{
  category: AdminCategory | null;
  catalogType: CatalogType;
}>();
const emit = defineEmits<{ close: []; saved: [] }>();
const name = ref(props.category?.name ?? "");
const type = ref(props.category?.catalog_type ?? props.catalogType);
const sort = ref(props.category?.sort_order ?? 10);
const enabled = ref(props.category?.is_enabled ?? true);
const busy = ref(false);
const error = ref("");
async function save() {
  if (busy.value) return;
  error.value = "";
  if (!name.value.trim()) {
    error.value = "分类名称不能为空";
    return;
  }
  busy.value = true;
  try {
    await api("saveCategory", {
      category_id: props.category?.category_id ?? null,
      catalog_type: type.value,
      name: name.value.trim(),
      sort_order: Number(sort.value),
      is_enabled: enabled.value,
    });
    emit("saved");
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <Modal
    :title="category ? '编辑分类' : '创建分类'"
    :busy="busy"
    @close="emit('close')"
    ><form @submit.prevent="save">
      <FormError :message="error" />
      <fieldset :disabled="busy">
        <label for="category-name">分类名称</label
        ><input
          id="category-name"
          v-model="name"
          maxlength="80"
          required
          autofocus
          placeholder="例如：水晶、成品手串"
        />
        <label for="category-type">目录类型</label
        ><select
          id="category-type"
          v-model="type"
          :disabled="Boolean(category?.item_count)"
        >
          <option v-for="(label, key) in catalogLabels" :key="key" :value="key">
            {{ label }}
          </option>
        </select>
        <p class="field-hint">已有商品的分类不能更改目录类型。</p>
        <label for="category-sort">排序值</label
        ><input
          id="category-sort"
          v-model.number="sort"
          type="number"
          step="1"
          min="-2147483648"
          max="2147483647"
          required
        />
        <p class="field-hint">数值越小，分类越靠前。</p>
        <label class="check-row"
          ><input v-model="enabled" type="checkbox" />前台展示此分类</label
        >
        <p class="field-hint">停用后前台隐藏；有待付款库存预占时不能停用。</p>
      </fieldset>
      <footer class="form-footer">
        <button
          type="button"
          class="secondary"
          :disabled="busy"
          @click="emit('close')"
        >
          取消</button
        ><button :disabled="busy">{{ busy ? "正在保存…" : "保存分类" }}</button>
      </footer>
    </form></Modal
  >
</template>
