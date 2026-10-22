<script setup lang="ts">
import {computed,onMounted,onBeforeUnmount,reactive,ref} from 'vue';
import type {AdminOrderDetail,OrderPage,OrderStatus,OrderSummary,ShipOrderPayload} from '../../../packages/contracts/src';
import {api,auth} from '../platform';
import {assertSignOutSucceeded} from '../auth-result';
import {ApiError} from '../../../packages/contracts/src/client';
import {componentsOf,moneyText,operationError,orderQuery,snapshotText,statusLabels} from '../order-model';
import MerchantSidebar from '../components/MerchantSidebar.vue';
import {formatBeijingTime} from '../time';
const filters=reactive<{status:OrderStatus|'';orderNo:string;from:string;to:string}>({status:'',orderNo:'',from:'',to:''});
const orders=ref<OrderSummary[]>([]),next=ref<string|null>(null),loading=ref(false),detailLoading=ref(false),busy=ref(false),error=ref(''),notice=ref('');
const detail=ref<AdminOrderDetail|null>(null),selected=ref(''),carrier=ref(''),tracking=ref(''),failedImages=ref<Record<string,boolean>>({});
const pendingShipments=reactive(new Map<string,ShipOrderPayload>());
const lockedShipment=computed(()=>selected.value?pendingShipments.get(selected.value):undefined);
let listVersion=0,detailVersion=0;
let applied:ReturnType<typeof orderQuery>=orderQuery(filters,null);
async function load(append=false) {
 if(append&&loading.value)return;
 let query:ReturnType<typeof orderQuery>;
 try {query=append?{...applied,page_token:next.value}:orderQuery(filters,null);}catch(e){error.value=operationError(e);return;}
 const version=++listVersion;loading.value=true;error.value='';
 if(!append){applied=query;orders.value=[];next.value=null;}
 try {const {data}=await api<OrderPage>('listAdminOrders',query);if(version!==listVersion)return;orders.value=append?[...orders.value,...data.orders]:data.orders;next.value=data.next_page_token;}
 catch(e){if(version===listVersion)error.value=operationError(e);}finally{if(version===listVersion)loading.value=false;}
}
async function open(orderNo:string) {
 if(busy.value)return;
 const version=++detailVersion;selected.value=orderNo;detail.value=null;detailLoading.value=true;error.value='';failedImages.value={};
 const pending=pendingShipments.get(orderNo);carrier.value=pending?.carrier_name??'';tracking.value=pending?.tracking_no??'';
 try {const {data}=await api<AdminOrderDetail>('getAdminOrderDetail',{order_no:orderNo});if(version!==detailVersion)return;if(data.order_no!==orderNo)throw new Error('订单详情与请求不符，请重新读取');detail.value=data;}
 catch(e){if(version===detailVersion)error.value=operationError(e);}finally{if(version===detailVersion)detailLoading.value=false;}
}
async function fulfill(action:'shipOrder'|'completeOrder') {
 const target=detail.value;if(!target||busy.value||detailLoading.value)return;
 if(action==='shipOrder'&&target.status!=='READY_TO_SHIP'||action==='completeOrder'&&target.status!=='SHIPPED')return;
 let payload:ShipOrderPayload|{order_no:string}={order_no:target.order_no};
 if(action==='shipOrder') {
  payload=pendingShipments.get(target.order_no)??{order_no:target.order_no,carrier_name:carrier.value.trim(),tracking_no:tracking.value.trim()};
  if(!('carrier_name'in payload)||!payload.carrier_name||!payload.tracking_no){error.value='请填写物流公司和运单号';return;}
  if(payload.carrier_name.length>80||/[\r\n\x00-\x1f]/.test(payload.carrier_name)){error.value='物流公司须为1–80字，不能包含控制字符';return;}
  if(!/^[A-Za-z0-9-]{3,80}$/.test(payload.tracking_no)){error.value='运单号须为3–80位字母、数字或连字符';return;}
  if(!confirm(`确认将订单 ${target.order_no} 使用 ${payload.carrier_name} / ${payload.tracking_no} 发货？`))return;
  pendingShipments.set(target.order_no,payload);
 } else if(!confirm(`由商家确认订单 ${target.order_no} 履约完成。该操作可能由后端发放首单邀请积分，确认继续？`))return;
 busy.value=true;error.value='';notice.value='';
 try {
  await api(action,payload);pendingShipments.delete(target.order_no);notice.value=action==='shipOrder'?'发货已登记，正在重读服务器订单状态。':'履约完成已确认，首单邀请积分由后端处理。';
  // Clear actionable detail before rereading; never infer an order/payment state locally.
  detail.value=null;busy.value=false;const refresh=open(target.order_no);busy.value=true;await Promise.all([load(),refresh]);
 }catch(e){
  const invalidShipment=action==='shipOrder'&&e instanceof ApiError&&e.code==='INVALID_ARGUMENT';
  if(invalidShipment)pendingShipments.delete(target.order_no);
  error.value=operationError(e)+(invalidShipment?'。请求未通过校验，请修正物流信息后再提交。':action==='shipOrder'?'。结果未确认，请使用原订单与原物流参数重试。':'。请在同一订单重试确认。');
 }
 finally{busy.value=false;}
}
function reset(){if(busy.value)return;Object.assign(filters,{status:'',orderNo:'',from:'',to:''});void load();}
function image(id:unknown):string|undefined {return typeof id==='string'&&!failedImages.value[id]?detail.value?.image_urls?.[id]:undefined;}
async function logout(){try{assertSignOutSucceeded(await auth.signOut());}catch(e){error.value=operationError(e);}}
onMounted(()=>load());onBeforeUnmount(()=>{listVersion++;detailVersion++;});
</script>
<template>
 <div class="catalog-shell operations-shell"><MerchantSidebar active="orders" :busy="busy" @logout="logout"/><main class="catalog-workspace">
  <header class="catalog-page-header"><div><p class="eyebrow">ORDERS / 订单</p><h1>订单履约</h1><p class="muted">按成交快照配货，物流与履约状态以服务器为准。</p></div><button class="secondary" :disabled="busy||loading" @click="load()">刷新订单</button></header>
  <p v-if="notice" role="status" class="success-notice">{{notice}}</p><p v-if="error" role="alert" class="error">{{error}}</p>
  <section class="product-panel"><form class="operations-filters" @submit.prevent="load()"><label>订单状态<select id="order-status" v-model="filters.status" :disabled="busy"><option value="">全部状态</option><option v-for="(label,key) in statusLabels" :key="key" :value="key">{{label}}</option></select></label><label>完整订单号<input id="order-number" v-model="filters.orderNo" :disabled="busy" placeholder="输入完整订单号"/></label><label>创建开始时间（北京时间）<input v-model="filters.from" type="datetime-local" :disabled="busy"/></label><label>创建结束时间（北京时间）<input v-model="filters.to" type="datetime-local" :disabled="busy"/></label><button :disabled="busy">查询</button><button type="button" class="secondary" :disabled="busy" @click="reset">清空筛选</button></form>
   <p v-if="loading" role="status">正在读取订单…</p><div class="table-scroll"><table class="product-table"><thead><tr><th>订单 / 商品</th><th>状态</th><th>订单金额</th><th>收货人</th><th>创建时间（北京时间）</th></tr></thead><tbody><tr v-for="row in orders" :key="row.order_no" :class="{chosen:selected===row.order_no}"><td><button class="text-button order-number" :disabled="busy" @click="open(row.order_no)">{{row.order_no}}</button><small>{{row.item_summary}}</small></td><td>{{statusLabels[row.status]}}</td><td>¥{{moneyText(row.total_amount_cent)}}</td><td>{{row.receiver_name||'—'}}</td><td>{{formatBeijingTime(row.created_at)}}</td></tr></tbody></table></div><p v-if="!loading&&!orders.length" class="empty-inline">没有符合条件的订单。</p><button v-if="next" class="secondary load-more" :disabled="loading||busy" @click="load(true)">加载更多订单</button>
  </section>
  <p v-if="detailLoading" role="status">正在读取订单详情…</p><button v-if="selected&&!detail&&!detailLoading" class="secondary" :disabled="busy" @click="open(selected)">重新读取订单详情</button>
  <section v-if="detail" class="item-detail order-detail" aria-label="订单详情"><div class="row-between"><h2>订单详情</h2><button class="secondary" :disabled="busy" @click="open(detail.order_no)">重读详情</button></div><h3 class="order-number">{{detail.order_no}}</h3><dl class="operations-facts"><dt>订单状态</dt><dd>{{statusLabels[detail.status]}}</dd><dt>付款模式</dt><dd>{{detail.payment_mode==='ZERO_PAY'?'零元订单（ZERO_PAY）':'微信支付（WECHAT）'}}</dd><dt>商品金额 / 优惠 / 运费 / 订单金额</dt><dd>¥{{moneyText(detail.goods_amount_cent)}} / ¥{{moneyText(detail.discount_amount_cent)}} / ¥{{moneyText(detail.shipping_fee_cent)}} / ¥{{moneyText(detail.total_amount_cent)}}</dd><dt>收货地址快照</dt><dd>{{snapshotText(detail.address_snapshot.receiver_name)}} · {{snapshotText(detail.address_snapshot.phone)}}<br/>{{snapshotText(detail.address_snapshot.full_address)}}</dd><dt>创建 / 支付截止（北京时间）</dt><dd>{{formatBeijingTime(detail.created_at)}} / {{formatBeijingTime(detail.payment_deadline_at)}}</dd><dt>付款 / 完成时间（北京时间）</dt><dd>{{formatBeijingTime(detail.paid_at)}} / {{formatBeijingTime(detail.completed_at)}}</dd></dl>
   <h3>成交商品与配货快照</h3><article v-for="(item,index) in detail.items" :key="index" class="snapshot-item"><div class="snapshot-heading"><img v-if="image(item.item_snapshot.image_file_id)" :src="image(item.item_snapshot.image_file_id)" alt="成交商品快照" @error="failedImages[String(item.item_snapshot.image_file_id)]=true"/><div><h4>{{snapshotText(item.item_snapshot.name)}} × {{item.quantity}}</h4><p>{{item.item_type==='DESIGN'?'设计':'标准商品'}} · {{item.item_type==='DESIGN'?`设计版本 ID ${snapshotText(item.item_snapshot.design_version_id)} / 版本 ${snapshotText(item.item_snapshot.version_no)}`:snapshotText(item.item_snapshot.spec_text)}}</p><p>原价 ¥{{moneyText(item.gross_amount_cent)}} · 优惠 ¥{{moneyText(item.discount_amount_cent)}} · 成交 ¥{{moneyText(item.line_amount_cent)}}</p></div></div><p class="field-hint">以下顺序来自保存的成交快照；每个位置的配货数量为该订单行购买数量。</p><div class="table-scroll"><table><thead><tr><th>位置（从 0 起）</th><th>成交 SKU</th><th>材料名称</th><th>珠径</th><th>配货数量</th><th>图片</th></tr></thead><tbody><tr v-for="(component,i) in componentsOf(item.item_snapshot)" :key="i"><td>{{snapshotText(component.position)}}</td><td>{{snapshotText(component.sku_id)}}</td><td>{{snapshotText(component.name)}}</td><td>{{component.diameter_mm===null?'—':snapshotText(component.diameter_mm)+' mm'}}</td><td>{{item.quantity}}</td><td><img v-if="image(component.image_file_id)" class="material-snapshot" :src="image(component.image_file_id)" :alt="snapshotText(component.name)" @error="failedImages[String(component.image_file_id)]=true"/><span v-else>无可用预览</span></td></tr></tbody></table></div><details v-if="item.promotion_snapshot"><summary>成交优惠快照</summary><pre>{{JSON.stringify(item.promotion_snapshot,null,2)}}</pre></details></article>
   <h3>支付摘要</h3><dl v-if="detail.payment" class="operations-facts"><dt>商户订单号</dt><dd>{{detail.payment.out_trade_no}}</dd><dt>支付流水 / 状态</dt><dd>{{detail.payment.transaction_id||'—'}} / {{detail.payment.trade_state||'—'}}</dd><dt>支付时间（北京时间）</dt><dd>{{formatBeijingTime(detail.payment.paid_at)}}</dd></dl><p v-else>无微信支付记录（零元订单无需微信付款）。</p>
   <h3>库存预占记录</h3><p v-if="!detail.reservations.length">暂无库存预占记录。</p><ul><li v-for="(r,i) in detail.reservations" :key="i">SKU {{r.sku_id}} × {{r.quantity}} · {{r.status}}</li></ul>
   <h3>物流</h3><p v-if="detail.shipping">{{detail.shipping.carrier_name}} · {{detail.shipping.tracking_no}}<br/>发货时间（北京时间）{{formatBeijingTime(detail.shipping.shipped_at)}}</p><p v-else>尚未登记物流。</p>
   <form v-if="detail.status==='READY_TO_SHIP'" data-test="shipment-form" class="fulfillment-form" @submit.prevent="fulfill('shipOrder')"><h3>登记发货</h3><p v-if="lockedShipment" class="field-hint">上次结果未确认，重试将沿用原订单和原物流参数。请先核实物流。</p><fieldset :disabled="busy||!!lockedShipment"><label for="carrier-name">物流公司</label><input id="carrier-name" v-model="carrier" maxlength="80" required/><label for="tracking-no">运单号</label><input id="tracking-no" v-model="tracking" minlength="3" maxlength="80" pattern="[A-Za-z0-9-]{3,80}" required/></fieldset><button :disabled="busy">{{busy?'处理中…':lockedShipment?'使用原物流重试发货':'确认发货'}}</button></form>
   <div v-if="detail.status==='SHIPPED'" class="fulfillment-form"><p>由商家确认履约完成，可能发放首单邀请积分（后端处理）。</p><button :disabled="busy" @click="fulfill('completeOrder')">{{busy?'处理中…':'确认履约完成'}}</button></div><p class="field-hint">退款申请与其他售后问题由客服微信处理。</p>
  </section>
 </main></div>
</template>
