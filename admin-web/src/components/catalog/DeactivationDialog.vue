<script setup lang="ts">
import { onMounted, ref } from "vue";
import { AlertTriangle, RefreshCw } from "@lucide/vue";
import type {
  AdminCatalogSku,
  SaveCatalogSkuPayload,
  SkuDeactivationPreview,
  DeactivationOperation,
} from "../../../../packages/contracts/src/catalog";
import { api } from "../../platform";
import { errorMessage } from "../../catalog-model";
import Modal from "./Modal.vue";
import FormError from "./FormError.vue";
const props = defineProps<{
  sku: AdminCatalogSku;
  operation: DeactivationOperation;
  payload?: SaveCatalogSkuPayload;
}>();
const emit = defineEmits<{ close: []; saved: [] }>();
const preview = ref<SkuDeactivationPreview | null>(null);
const busy = ref(false);
const loading = ref(false);
const error = ref("");
async function load() {
  loading.value = true;
  preview.value = null;
  try {
    const { data } = await api<SkuDeactivationPreview>(
      "previewSkuDeactivation",
      { sku_id: props.sku.sku_id, operation: props.operation },
    );
    preview.value = data;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function confirm() {
  if (busy.value || !preview.value?.can_execute || !preview.value.impact_hash)
    return;
  busy.value = true;
  error.value = "";
  try {
    if (props.operation === "DELETE") {
      await api("deleteCatalogSku", {
        sku_id: props.sku.sku_id,
        impact_hash: preview.value.impact_hash,
      });
    } else {
      const sku = props.sku;
      await api("saveCatalogSku", {
        ...(props.payload ?? {
          sku_id: sku.sku_id,
          item_id: sku.item_id,
          spec_values: sku.spec_values,
          diameter_mm: sku.diameter_mm,
          image_file_id: sku.image_file_id,
          price_cent: sku.price_cent,
          points_exchange_enabled: sku.points_exchange_enabled,
          points_cost: sku.points_cost,
        }),
        is_on_sale: false,
        deactivation_impact_hash: preview.value.impact_hash,
      });
    }
    emit("saved");
  } catch (e) {
    error.value = errorMessage(e);
    await load();
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <Modal
    :title="operation === 'DELETE' ? '删除 SKU 前确认' : '下架 SKU 前确认'"
    :busy="busy"
    @close="emit('close')"
    ><FormError :message="error" />
    <p class="context-label">
      SKU {{ sku.sku_id }} · 历史设计、订单和图片资料会保留
    </p>
    <p v-if="loading" role="status">正在核对待付款预占与兑换券…</p>
    <template v-if="preview"
      ><div v-if="!preview.can_execute" class="blocked-notice">
        <AlertTriangle :size="22" aria-hidden="true" />
        <div>
          <strong
            >当前不能{{ operation === "DELETE" ? "删除" : "下架" }}</strong
          >
          <p>
            库存预占 {{ preview.stock_reserved }} 件，关联待付款订单
            {{
              preview.pending_order_count
            }}
            笔。请等待相关订单付款或关闭后重新检查；如果预占为
            0，请核查兑换券锁定状态。
          </p>
        </div>
      </div>
      <div class="impact-summary">
        <h3>本次操作影响</h3>
        <dl>
          <dt>可退积分的兑换券</dt>
          <dd>{{ preview.available_coupon_count }} 张</dd>
          <dt>需退回积分</dt>
          <dd>{{ preview.refundable_points }} 积分</dd>
          <dt>涉及账户</dt>
          <dd>{{ preview.affected_accounts.length }} 个</dd>
        </dl>
        <p class="field-hint">
          按每张券兑换时的积分退回；确认时会再次核对，发生变化需重新确认。
        </p>
      </div>
      <ul v-if="preview.affected_accounts.length" class="account-impact">
        <li
          v-for="account in preview.affected_accounts"
          :key="account.account_id"
        >
          <span>{{ account.openid_masked }}</span
          ><span
            >{{ account.coupon_count }} 张 · 退回
            {{ account.refund_points }} 积分</span
          >
        </li>
      </ul>
    </template>
    <footer class="form-footer">
      <button
        type="button"
        class="secondary"
        :disabled="busy || loading"
        @click="load"
      >
        <RefreshCw :size="16" aria-hidden="true" />重新检查</button
      ><button
        type="button"
        class="danger-button"
        :disabled="
          busy || loading || !preview?.can_execute || !preview?.impact_hash
        "
        @click="confirm"
      >
        {{
          busy
            ? "正在处理…"
            : operation === "DELETE"
              ? "确认删除并退分"
              : "确认下架并退分"
        }}
      </button>
    </footer></Modal
  >
</template>
