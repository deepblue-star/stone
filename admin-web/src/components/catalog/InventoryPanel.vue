<script setup lang="ts">
import { onMounted, ref } from "vue";
import type {
  AdminCatalogSku,
  InventoryMovementPage,
  InventoryMovement,
} from "../../../../packages/contracts/src/catalog";
import { api,auth } from "../../platform";
import { errorMessage, stockOperationKey,completeStockOperation } from "../../catalog-model";
import Modal from "./Modal.vue";
import FormError from "./FormError.vue";
const props = defineProps<{ sku: AdminCatalogSku }>();
const emit = defineEmits<{ close: []; changed: [] }>();
const total = ref(props.sku.stock_total);
const reserved = ref(props.sku.stock_reserved);
const delta = ref<number | null>(null);
const remark = ref("");
const busy = ref(false);
const listing = ref(false);
const error = ref("");
const notice = ref("");
const rows = ref<InventoryMovement[]>([]);
const next = ref<string | null>(null);
async function load(append = false) {
  if (listing.value) return;
  listing.value = true;
  try {
    const { data } = await api<InventoryMovementPage>(
      "listInventoryMovements",
      {
        sku_id: props.sku.sku_id,
        page_token: append ? next.value : null,
        page_size: 20,
      },
    );
    rows.value = append ? [...rows.value, ...data.movements] : data.movements;
    next.value = data.next_page_token;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    listing.value = false;
  }
}
async function adjust() {
  if (busy.value) return;
  error.value = "";
  notice.value = "";
  const value = Number(delta.value);
  if (!Number.isInteger(value) || value === 0) {
    error.value = "库存增减量必须是非零整数";
    return;
  }
  if (!remark.value.trim()) {
    error.value = "请填写本次库存变动原因";
    return;
  }
  busy.value = true;
  try {
    const session=await auth.getSession();
    if(session.error||!session.data.session)throw new Error('请先登录');
    const user:unknown=session.data.session.user;
    const actor=user&&typeof user==='object'&&'uid' in user&&typeof user.uid==='string'?user.uid:user&&typeof user==='object'&&'id' in user&&typeof user.id==='string'?user.id:null;
    if(!actor)throw new Error('无法识别当前账号，请重新登录后再调整库存');
    const operation_key = stockOperationKey(
      localStorage,
      props.sku.sku_id,
      value,
      remark.value.trim(),
      ()=>crypto.randomUUID(),
      actor,
    );
    const { data } = await api<{ stock_total: number; stock_reserved: number }>(
      "adjustInventory",
      {
        operation_key,
        sku_id: props.sku.sku_id,
        stock_delta: value,
        remark: remark.value.trim(),
      },
    );
    total.value = data.stock_total;
    reserved.value = data.stock_reserved;
    completeStockOperation(localStorage,props.sku.sku_id,value,remark.value.trim(),operation_key,actor);
    delta.value = null;
    remark.value = "";
    notice.value = "库存调整已保存，流水已记录";
    emit("changed");
    await load();
  } catch (e) {
    error.value = `${errorMessage(e)}。若结果未知，请保持数量和原因不变后重试。`;
  } finally {
    busy.value = false;
  }
}
onMounted(() => load());
const actions: Record<string, string> = {
  ADMIN_ADJUST: "人工调整",
  RESERVE: "订单预占",
  RELEASE: "关单释放",
  CONSUME: "订单消耗",
};
</script>
<template>
  <Modal title="库存与变动记录" wide :busy="busy" @close="emit('close')"
    ><p class="context-label">SKU {{ sku.sku_id }}</p>
    <div class="stock-metrics">
      <div>
        <span>总库存</span><strong>{{ total }}</strong>
      </div>
      <div>
        <span>待付款预占</span><strong>{{ reserved }}</strong>
      </div>
      <div>
        <span>可用库存</span><strong>{{ total - reserved }}</strong>
      </div>
    </div>
    <FormError :message="error" />
    <p v-if="notice" class="success-notice" role="status">{{ notice }}</p>
    <form @submit.prevent="adjust">
      <fieldset :disabled="busy">
        <div class="field-grid">
          <div>
            <label for="stock-delta">库存增减量</label
            ><input
              id="stock-delta"
              v-model.number="delta"
              type="number"
              step="1"
              required
              placeholder="补货填 5，盘亏填 -2"
            />
          </div>
          <div>
            <label for="stock-reason">调整原因</label
            ><input
              id="stock-reason"
              v-model="remark"
              maxlength="255"
              required
              placeholder="例如：补货入库、盘点修正"
            />
          </div>
        </div>
      </fieldset>
      <div class="row-between">
        <p class="field-hint">调整后的总库存不能小于预占数量。</p>
        <button :disabled="busy">
          {{ busy ? "正在登记…" : "登记库存调整" }}
        </button>
      </div>
    </form>
    <section class="form-section">
      <h3>库存流水</h3>
      <p v-if="listing && !rows.length" role="status">正在读取变动记录…</p>
      <p v-else-if="!rows.length" class="empty-inline">
        暂无库存变动，登记后将在这里显示。
      </p>
      <div v-else class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>类型</th>
              <th>库存变化</th>
              <th>预占变化</th>
              <th>原因／来源</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in rows" :key="index">
              <td>
                {{
                  new Date(row.created_at).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })
                }}
              </td>
              <td>{{ actions[row.action] ?? row.action }}</td>
              <td class="numeric">
                {{ row.stock_delta > 0 ? "+" : "" }}{{ row.stock_delta }}
              </td>
              <td class="numeric">
                {{ row.reserved_delta > 0 ? "+" : "" }}{{ row.reserved_delta }}
              </td>
              <td>
                {{ row.remark || "—"
                }}<small v-if="row.order_id">订单 {{ row.order_id }}</small>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button
        v-if="next"
        type="button"
        class="secondary load-more"
        :disabled="listing"
        @click="load(true)"
      >
        {{ listing ? "读取中…" : "加载更多流水" }}
      </button>
    </section></Modal
  >
</template>
