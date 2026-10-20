<script setup lang="ts">
import { reactive, ref, computed } from "vue";
import type {
  AdminCatalogItem,
  AdminCatalogSku,
  SaveCatalogSkuPayload,
} from "../../../../packages/contracts/src/catalog";
import { api } from "../../platform";
import { errorMessage, formatPrice, skuPayload,skuSpecValues } from "../../catalog-model";
import Modal from "./Modal.vue";
import FormError from "./FormError.vue";
import ImagePicker from "./ImagePicker.vue";
const props = defineProps<{
  item: AdminCatalogItem;
  sku: AdminCatalogSku | null;
}>();
const emit = defineEmits<{
  close: [];
  saved: [];
  deactivate: [payload: SaveCatalogSkuPayload];
}>();
const dimensions = props.item.spec_schema?.dimensions ?? [];
const values = reactive<Record<string, string>>({ ...props.sku?.spec_values });
const draft = reactive({
  sku_id: props.sku?.sku_id ?? null,
  item_id: props.item.item_id,
  diameter_mm: props.sku?.diameter_mm ?? null,
  image_file_id: props.sku?.image_file_id ?? null,
  price: props.sku ? formatPrice(props.sku.price_cent) : "",
  is_on_sale: props.sku?.is_on_sale ?? false,
  points_exchange_enabled: props.sku?.points_exchange_enabled ?? false,
  points_cost: props.sku?.points_cost ?? null,
});
const images = computed({
  get: () => (draft.image_file_id ? [draft.image_file_id] : []),
  set: (value: string[]) => {
    draft.image_file_id = value[0] ?? null;
  },
});
const busy = ref(false);
const uploading = ref(false);
const error = ref("");
async function save() {
  if (busy.value || uploading.value) return;
  error.value = "";
  try {
    const payload = skuPayload({
      ...draft,
      spec_values:
        skuSpecValues(props.item.catalog_type,props.sku?.spec_values??null,{...values}),
      diameter_mm:
        draft.diameter_mm === null || String(draft.diameter_mm) === ""
          ? null
          : Number(draft.diameter_mm),
      points_cost:
        draft.points_cost === null ? null : Number(draft.points_cost),
    });
    if (props.sku?.is_on_sale && !payload.is_on_sale) {
      emit("deactivate", payload);
      return;
    }
    busy.value = true;
    await api("saveCatalogSku", payload);
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
    :title="sku ? '编辑 SKU' : '添加 SKU'"
    :busy="busy || uploading"
    @close="emit('close')"
    ><form @submit.prevent="save">
      <FormError :message="error" />
      <p class="context-label">{{ item.name }}</p>
      <fieldset :disabled="busy">
        <template v-if="item.catalog_type === 'STANDARD'"
          ><div v-for="dimension in dimensions" :key="dimension.key">
            <label :for="`sku-${dimension.key}`">{{ dimension.label }}</label
            ><select
              :id="`sku-${dimension.key}`"
              v-model="values[dimension.key]"
              required
            >
              <option value="" disabled>请选择{{ dimension.label }}</option>
              <option
                v-for="option in dimension.options"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
          <p v-if="!dimensions.length" class="field-hint">
            无可选规格，每件商品只能创建一个默认 SKU。
          </p></template
        >
        <template v-else
          ><label for="sku-diameter">直径（mm）</label
          ><input
            id="sku-diameter"
            v-model.number="draft.diameter_mm"
            type="number"
            min="0.01"
            max="99999.99"
            step="0.01"
            placeholder="例如：8"
        /></template>
        <label for="sku-price">销售单价（元）</label
        ><input
          id="sku-price"
          v-model="draft.price"
          type="text"
          inputmode="decimal"
          pattern="[0-9]+(\.[0-9]{1,2})?"
          required
          placeholder="0.00"
        />
        <p class="field-hint">
          珠子、配件按单颗／件计价，标准商品按该规格整件计价。
        </p>
        <ImagePicker
          v-model="images"
          label="SKU 图片"
          :max="1"
          :disabled="busy"
          :resolved="item.image_urls"
          @busy="uploading = $event"
        />
        <label class="check-row"
          ><input v-model="draft.is_on_sale" type="checkbox" />此 SKU
          上架</label
        >
        <div v-if="item.catalog_type === 'BEAD'" class="form-section">
          <label class="check-row"
            ><input
              v-model="draft.points_exchange_enabled"
              type="checkbox"
            />允许积分兑换免费珠子券</label
          ><template v-if="draft.points_exchange_enabled"
            ><label for="sku-points">每张券所需积分</label
            ><input
              id="sku-points"
              v-model.number="draft.points_cost"
              type="number"
              min="1"
              step="1"
              required
          /></template>
        </div>
        <p class="callout-neutral">
          {{
            sku
              ? `当前总库存 ${sku.stock_total}，预占 ${sku.stock_reserved}。`
              : "新 SKU 初始库存为 0。"
          }}保存后通过“调整库存”登记数量和原因，本表单不会直接覆盖库存。
        </p>
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
            uploading
              ? "等待图片上传…"
              : busy
                ? "正在保存…"
                : sku?.is_on_sale && !draft.is_on_sale
                  ? "下一步：预览下架影响"
                  : "保存 SKU"
          }}
        </button>
      </footer>
    </form></Modal
  >
</template>
