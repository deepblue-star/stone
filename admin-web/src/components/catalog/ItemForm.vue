<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Plus, Trash2 } from "@lucide/vue";
import type {
  AdminCategory,
  AdminCatalogItem,
  SpecSchema,
} from "../../../../packages/contracts/src/catalog";
import { api } from "../../platform";
import { cloneDimensions, errorMessage } from "../../catalog-model";
import Modal from "./Modal.vue";
import FormError from "./FormError.vue";
import ImagePicker from "./ImagePicker.vue";
const props = defineProps<{
  item: AdminCatalogItem | null;
  categories: AdminCategory[];
  categoryId: string;
}>();
const emit = defineEmits<{ close: []; saved: [id: string] }>();
const draft = reactive({
  category_id: props.item?.category_id ?? props.categoryId,
  name: props.item?.name ?? "",
  description: props.item?.description ?? "",
  images: [...(props.item?.images ?? [])],
  is_on_sale: props.item?.is_on_sale ?? false,
});
const dimensions = ref<SpecSchema["dimensions"]>(
  cloneDimensions(props.item?.spec_schema??null),
);
const type = computed(
  () =>
    props.categories.find((c) => c.category_id === draft.category_id)
      ?.catalog_type,
);
const busy = ref(false);
const uploading = ref(false);
const error = ref("");
const categories = computed(() =>
  props.categories.filter(
    (c) => !props.item || c.catalog_type === props.item.catalog_type,
  ),
);
function addDimension() {
  dimensions.value.push({
    key: `dimension_${crypto.randomUUID().replaceAll("-", "_")}`,
    label: "",
    options: [{ value: "OPTION_1", label: "" }],
  });
}
function addOption(dimension: SpecSchema["dimensions"][number]) {
  dimension.options.push({
    value: `OPTION_${crypto.randomUUID().replaceAll("-", "_")}`,
    label: "",
  });
}
async function save() {
  if (busy.value || uploading.value) return;
  error.value = "";
  if (!draft.category_id) {
    error.value = "请先选择分类";
    return;
  }
  if (!draft.name.trim()) {
    error.value = "商品名称不能为空";
    return;
  }
  if (
    type.value === "STANDARD" &&
    dimensions.value.some(
      (d) => !d.label.trim() || d.options.some((o) => !o.label.trim()),
    )
  ) {
    error.value = "请填写完整的规格名称与选项名称";
    return;
  }
  busy.value = true;
  try {
    const result = await api<AdminCatalogItem>("saveCatalogItem", {
      item_id: props.item?.item_id ?? null,
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      spec_schema:
        type.value === "STANDARD" ? { dimensions: dimensions.value } : null,
    });
    emit("saved", result.data.item_id);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <Modal
    :title="item ? '编辑商品资料' : '创建商品'"
    :busy="busy || uploading"
    wide
    @close="emit('close')"
    ><form @submit.prevent="save">
      <FormError :message="error" />
      <fieldset :disabled="busy">
        <div class="form-section">
          <div class="section-caption">
            <span>01</span>
            <h3>公共资料</h3>
          </div>
          <div class="field-grid">
            <div>
              <label for="item-category">所属分类</label
              ><select id="item-category" v-model="draft.category_id" required>
                <option value="" disabled>请选择分类</option>
                <option
                  v-for="c in categories"
                  :key="c.category_id"
                  :value="c.category_id"
                >
                  {{ c.name }}{{ !c.is_enabled ? "（已停用）" : "" }}
                </option>
              </select>
            </div>
            <div>
              <label for="item-name">商品名称</label
              ><input
                id="item-name"
                v-model="draft.name"
                maxlength="160"
                required
                autofocus
                placeholder="例如：净体白水晶"
              />
            </div>
          </div>
          <label for="item-description">商品说明</label
          ><textarea
            id="item-description"
            v-model="draft.description"
            rows="3"
            maxlength="10000"
            placeholder="材质、特点及需要说明的信息"
          />
          <ImagePicker
            v-model="draft.images"
            label="商品图片"
            :disabled="busy"
            :resolved="item?.image_urls"
            @busy="uploading = $event"
          />
        </div>
        <div v-if="type === 'STANDARD'" class="form-section">
          <div class="section-caption">
            <span>02</span>
            <h3>商品规格</h3>
          </div>
          <p class="field-hint">
            定义顾客可以选择的规格，例如“碎石”下有“标准白水晶”和“高透白水晶”。具体组合的价格和库存，在保存商品后添加
            SKU。
          </p>
          <div
            v-for="(dimension, index) in dimensions"
            :key="index"
            class="dimension-editor"
          >
            <div class="row-between">
              <label :for="`dimension-${index}`">规格 {{ index + 1 }}</label
              ><button
                type="button"
                class="text-button danger-text"
                @click="dimensions.splice(index, 1)"
              >
                <Trash2 :size="15" aria-hidden="true" />移除此规格
              </button>
            </div>
            <input
              :id="`dimension-${index}`"
              v-model="dimension.label"
              required
              maxlength="80"
              placeholder="规格名称，例如：碎石"
            />
            <div
              v-for="(option, optionIndex) in dimension.options"
              :key="optionIndex"
              class="option-editor"
            >
              <input
                v-model="option.label"
                :aria-label="`规格 ${index + 1} 的选项 ${optionIndex + 1}`"
                required
                maxlength="80"
                placeholder="选项名称，例如：标准白水晶"
              /><button
                type="button"
                class="icon-button"
                :aria-label="`移除选项 ${optionIndex + 1}`"
                :disabled="dimension.options.length === 1"
                @click="dimension.options.splice(optionIndex, 1)"
              >
                <Trash2 :size="16" aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              class="text-button"
              @click="addOption(dimension)"
            >
              <Plus :size="16" aria-hidden="true" />添加选项
            </button>
            <details>
              <summary>开发标识</summary>
              <label
                >规格标识<input
                  v-model="dimension.key"
                  pattern="[A-Za-z][A-Za-z0-9_]*"
                  required
              /></label>
              <p class="field-hint">
                用于关联现有 SKU，修改后需保持所有 SKU 的规格仍有效。
              </p>
              <label v-for="(option, oi) in dimension.options" :key="oi"
                >选项 {{ oi + 1 }} 标识<input v-model="option.value" required
              /></label>
            </details>
          </div>
          <button
            type="button"
            class="secondary"
            :disabled="dimensions.length >= 4"
            @click="addDimension"
          >
            <Plus :size="17" aria-hidden="true" />添加规格维度
          </button>
        </div>
        <div class="form-section">
          <label class="check-row"
            ><input v-model="draft.is_on_sale" type="checkbox" />商品上架</label
          >
          <p class="field-hint">
            前台展示还需分类启用、具体 SKU 上架；有待付款库存预占时禁止下架。
          </p>
        </div>
      </fieldset>
      <footer class="form-footer">
        <button
          type="button"
          class="secondary"
          :disabled="busy || uploading"
          @click="emit('close')"
        >
          取消</button
        ><button :disabled="busy || uploading">
          {{
            uploading ? "等待图片上传…" : busy ? "正在保存…" : "保存商品资料"
          }}
        </button>
      </footer>
    </form></Modal
  >
</template>
