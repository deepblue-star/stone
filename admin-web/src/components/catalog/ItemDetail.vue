<script setup lang="ts">
import { Package, Plus, Pencil, Archive, Trash2 } from "@lucide/vue";
import {ref,watch} from 'vue';
import type {
  AdminCatalogItem,
  AdminCatalogSku,
} from "../../../../packages/contracts/src/catalog";
import { formatPrice, catalogLabels } from "../../catalog-model";
const props=defineProps<{ item: AdminCatalogItem; busy?: boolean }>();
const imageFailed=ref(false);
watch(()=>props.item,()=>{imageFailed.value=false;});
const emit = defineEmits<{
  edit: [];
  addSku: [];
  editSku: [sku: AdminCatalogSku];
  inventory: [sku: AdminCatalogSku];
  deactivate: [sku: AdminCatalogSku, operation: "OFF_SALE" | "DELETE"];
  delete: [];
}>();
function specLabel(item: AdminCatalogItem, sku: AdminCatalogSku): string {
  if (item.catalog_type !== "STANDARD")
    return sku.diameter_mm ? `${sku.diameter_mm} mm` : "未设置直径";
  return (
    item.spec_schema?.dimensions
      .map(
        (d) =>
          d.options.find((o) => o.value === sku.spec_values?.[d.key])?.label ??
          "未知规格",
      )
      .join(" / ") || "默认规格"
  );
}
</script>
<template>
  <section class="item-detail">
    <div class="row-between">
      <div>
        <p class="eyebrow">
          {{ catalogLabels[item.catalog_type] }} / {{ item.item_id }}
        </p>
        <h2>{{ item.name }}</h2>
      </div>
      <span class="status-badge" :class="{ active: item.is_on_sale }">{{
        item.is_on_sale ? "商品已上架" : "商品已下架"
      }}</span>
    </div>
    <div class="detail-intro">
      <div class="detail-cover">
        <img
          v-if="!imageFailed && item.images[0] && item.image_urls?.[item.images[0]]"
          :src="item.image_urls[item.images[0]]"
          :alt="item.name"
          loading="lazy"
          @error="imageFailed=true"
        /><Package v-else :size="40" aria-hidden="true" />
      </div>
      <div>
        <p class="item-description">
          {{ item.description || "尚未填写商品说明" }}
        </p>
        <div class="button-row">
          <button type="button" class="secondary" @click="emit('edit')">
            <Pencil :size="16" aria-hidden="true" />编辑商品资料</button
          ><button
            type="button"
            class="text-button danger-text"
            :disabled="busy"
            @click="emit('delete')"
          >
            <Trash2 :size="16" aria-hidden="true" />删除商品
          </button>
        </div>
        <p class="field-hint">
          删除商品前需先逐个处理 SKU；商品上下架不代替各 SKU 的状态维护。
        </p>
      </div>
    </div>
    <div class="row-between sku-heading">
      <div>
        <h3>规格与库存</h3>
        <p class="field-hint">一个 SKU 对应一组规格和独立价格、库存。</p>
      </div>
      <button type="button" @click="emit('addSku')">
        <Plus :size="17" aria-hidden="true" />添加 SKU
      </button>
    </div>
    <div v-if="!item.skus.length" class="empty-state compact">
      <Package :size="36" aria-hidden="true" />
      <h3>还没有具体规格</h3>
      <p>添加 SKU 后，登记库存并上架，即可供前台展示。</p>
    </div>
    <div v-else class="table-scroll">
      <table class="sku-table">
        <thead>
          <tr>
            <th>规格</th>
            <th>单价</th>
            <th>可用 / 总库存</th>
            <th>预占</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="sku in item.skus" :key="sku.sku_id">
            <td>
              <strong>{{ specLabel(item, sku) }}</strong
              ><small>SKU {{ sku.sku_id }}</small>
            </td>
            <td class="numeric">¥{{ formatPrice(sku.price_cent) }}</td>
            <td class="numeric">
              <strong>{{ sku.available_stock }}</strong> / {{ sku.stock_total }}
            </td>
            <td class="numeric">{{ sku.stock_reserved }}</td>
            <td>
              <span class="status-badge" :class="{ active: sku.is_on_sale }">{{
                sku.is_on_sale ? "上架" : "下架"
              }}</span
              ><small v-if="sku.points_exchange_enabled"
                >{{ sku.points_cost }} 积分可兑</small
              >
            </td>
            <td>
              <div class="row-actions">
                <button class="text-button" @click="emit('editSku', sku)">
                  编辑</button
                ><button class="text-button" @click="emit('inventory', sku)">
                  库存</button
                ><button
                  v-if="sku.is_on_sale"
                  class="text-button"
                  @click="emit('deactivate', sku, 'OFF_SALE')"
                >
                  <Archive :size="14" aria-hidden="true" />下架</button
                ><button
                  class="text-button danger-text"
                  @click="emit('deactivate', sku, 'DELETE')"
                >
                  删除
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
