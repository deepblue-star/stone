<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,reactive,ref} from 'vue';
import type {AdminPointsLedgerEntry,AdminPointsLedgerPage,AdminReferralRelation,AdminReferralRelationsPage,AdminSkuCoupon,AdminSkuCouponsPage} from '../../../packages/contracts/src';
import {api,auth} from '../platform';
import {assertSignOutSucceeded} from '../auth-result';
import {operationError} from '../order-model';
import {auditQuery,auditTabs,couponLabels,emptyAuditFilter,signedPoints,sourceLabels,type AuditTab} from '../audit-model';
import {formatBeijingTime} from '../time';
import MerchantSidebar from '../components/MerchantSidebar.vue';
const tab=ref<AuditTab>('ledger'),filters=reactive({ledger:emptyAuditFilter(),referrals:emptyAuditFilter(),coupons:emptyAuditFilter()});
const form=computed(()=>filters[tab.value]);
const ledger=ref<AdminPointsLedgerEntry[]>([]),referrals=ref<AdminReferralRelation[]>([]),coupons=ref<AdminSkuCoupon[]>([]);
const next=ref<string|null>(null),loading=ref(false),error=ref(''),loaded=ref(false),imageUrls=ref<Record<string,string>>({}),failedImages=ref<Record<string,boolean>>({});
const rowCount=computed(()=>tab.value==='ledger'?ledger.value.length:tab.value==='referrals'?referrals.value.length:coupons.value.length);
let generation=0,applied:ReturnType<typeof auditQuery>=auditQuery('ledger',filters.ledger,null);
function clearRows(){ledger.value=[];referrals.value=[];coupons.value=[];imageUrls.value={};failedImages.value={};next.value=null;loaded.value=false;}
async function load(append=false){
 if(append&&(loading.value||!next.value))return;
 const current=++generation,target=tab.value;
 let query:ReturnType<typeof auditQuery>;
 try{query=append?{...applied,page_token:next.value}:auditQuery(target,filters[target],null);}
 catch(e){clearRows();loading.value=false;error.value=operationError(e);return;}
 if(!append){clearRows();applied=query;}
 loading.value=true;error.value='';
 try{
  if(target==='ledger'){
   const {data}=await api<AdminPointsLedgerPage>('listAdminPointsLedger',query);if(current!==generation)return;
   ledger.value=append?[...ledger.value,...data.items]:data.items;next.value=data.next_page_token;
  }else if(target==='referrals'){
   const {data}=await api<AdminReferralRelationsPage>('listAdminReferralRelations',query);if(current!==generation)return;
   referrals.value=append?[...referrals.value,...data.items]:data.items;next.value=data.next_page_token;
  }else{
   const {data}=await api<AdminSkuCouponsPage>('listAdminSkuCoupons',query);if(current!==generation)return;
   coupons.value=append?[...coupons.value,...data.items]:data.items;next.value=data.next_page_token;imageUrls.value=append?{...imageUrls.value,...data.image_urls}:data.image_urls??{};
  }
  loaded.value=true;
 }catch(e){if(current===generation)error.value=operationError(e);}
 finally{if(current===generation)loading.value=false;}
}
function selectTab(value:AuditTab){if(value===tab.value)return;tab.value=value;void load();}
function reset(){Object.assign(filters[tab.value],emptyAuditFilter());void load();}
function image(row:AdminSkuCoupon){const id=row.current_sku.image_file_id,url=id?imageUrls.value[id]:undefined;return url&&!failedImages.value[url]?url:undefined;}
function imageFailed(row:AdminSkuCoupon,event:Event){const id=row.current_sku.image_file_id,target=event.currentTarget;if(!id||!(target instanceof HTMLImageElement))return;const url=target.currentSrc||target.src;if(imageUrls.value[id]===url)failedImages.value[url]=true;}
async function logout(){try{assertSignOutSucceeded(await auth.signOut());}catch(e){error.value=operationError(e);}}
onMounted(()=>load());onBeforeUnmount(()=>{generation++;});
</script>
<template>
 <div class="catalog-shell operations-shell audit-shell"><MerchantSidebar active="audit" @logout="logout"/><main class="catalog-workspace">
  <header class="catalog-page-header"><div><p class="eyebrow">MEMBERSHIP / 会员权益</p><h1>会员权益</h1><p class="muted">只读查看积分、邀请关系与兑换券。用户标识由服务器脱敏。</p></div><button class="secondary" :disabled="loading" @click="load()">重新读取</button></header>
  <div class="type-switch config-tabs" aria-label="权益记录分组"><button v-for="(label,value) in auditTabs" :key="value" :aria-pressed="tab===value" :class="{selected:tab===value}" @click="selectTab(value)">{{label}}</button></div>
  <section class="product-panel" :aria-label="auditTabs[tab]">
   <form class="operations-filters" @submit.prevent="load()">
    <template v-if="tab==='ledger'"><label for="audit-openid">用户 OpenID<input id="audit-openid" v-model="form.openid" autocomplete="off"/></label><label for="audit-source">积分来源<select id="audit-source" v-model="form.source"><option value="">全部来源</option><option v-for="(label,value) in sourceLabels" :key="value" :value="value">{{label}}</option></select></label></template>
    <template v-else-if="tab==='referrals'"><label for="audit-inviter">邀请人 OpenID<input id="audit-inviter" v-model="form.inviter" autocomplete="off"/></label><label for="audit-invitee">被邀请人 OpenID<input id="audit-invitee" v-model="form.invitee" autocomplete="off"/></label><label for="audit-rewarded">奖励状态<select id="audit-rewarded" v-model="form.rewarded"><option value="">全部</option><option value="true">已奖励</option><option value="false">未奖励</option></select></label></template>
    <template v-else><label for="audit-sku">SKU ID<input id="audit-sku" v-model="form.skuId" inputmode="numeric"/></label><label for="audit-openid">用户 OpenID<input id="audit-openid" v-model="form.openid" autocomplete="off"/></label><label for="audit-status">兑换券状态<select id="audit-status" v-model="form.status"><option value="">全部状态</option><option v-for="(label,value) in couponLabels" :key="value" :value="value">{{label}}</option></select></label></template>
    <label for="audit-from">创建开始时间（北京时间）<input id="audit-from" v-model="form.from" type="datetime-local" step="0.001"/></label><label for="audit-to">创建结束时间（北京时间）<input id="audit-to" v-model="form.to" type="datetime-local" step="0.001"/></label><button type="submit">查询</button><button type="button" class="secondary" @click="reset">清空筛选</button>
   </form>
   <p v-if="error" role="alert" class="error">{{error}}</p><p v-if="loading" role="status">正在读取{{auditTabs[tab]}}…</p>
   <div class="table-scroll"><table v-if="tab==='ledger'" class="product-table audit-table"><caption class="field-hint">积分流水 · 时间（北京时间）</caption><thead><tr><th>流水 ID</th><th>账户 / 用户</th><th>积分变动</th><th>变动后余额</th><th>来源 / 引用</th><th>说明</th><th>创建时间</th></tr></thead><tbody><tr v-for="row in ledger" :key="row.ledger_id"><td>{{row.ledger_id}}</td><td>{{row.account_id}}<small>{{row.openid_masked||'—'}}</small></td><td>{{signedPoints(row.points_delta)}}</td><td>{{row.balance_after}}</td><td>{{sourceLabels[row.source_type as keyof typeof sourceLabels]||row.source_type}}<small>{{row.source_ref||'—'}}</small></td><td>{{row.description||'—'}}</td><td>{{formatBeijingTime(row.created_at)}}</td></tr></tbody></table>
    <table v-else-if="tab==='referrals'" class="product-table audit-table"><caption class="field-hint">邀请关系 · 时间（北京时间）</caption><thead><tr><th>关系 ID</th><th>邀请人账户 / 用户</th><th>被邀请人账户 / 用户</th><th>绑定渠道 / 邀请码</th><th>奖励订单</th><th>奖励时间</th><th>创建时间</th></tr></thead><tbody><tr v-for="row in referrals" :key="row.relation_id"><td>{{row.relation_id}}</td><td>{{row.inviter_account_id}}<small>{{row.inviter_openid_masked||'—'}}</small></td><td>{{row.invitee_account_id}}<small>{{row.invitee_openid_masked||'—'}}</small></td><td>{{row.bind_channel==='SHARE_PATH'?'分享链接':'手动邀请码'}}<small>{{row.invite_code_snapshot}}</small></td><td>{{row.rewarded_order_no||'未奖励'}}</td><td>{{formatBeijingTime(row.rewarded_at)}}</td><td>{{formatBeijingTime(row.created_at)}}</td></tr></tbody></table>
    <table v-else class="product-table audit-table coupon-audit-table"><caption class="field-hint">兑换券 · 商品资料为当前状态，积分成本为兑换时快照 · 时间（北京时间）</caption><thead><tr><th>券 ID</th><th>账户 / 用户</th><th>SKU / 当前商品</th><th>状态 / 积分成本快照</th><th>来源 / 引用</th><th>锁定订单 / 时间</th><th>使用订单 / 时间</th><th>退回原因 / 时间</th><th>创建时间</th></tr></thead><tbody><tr v-for="row in coupons" :key="row.coupon_id"><td>{{row.coupon_id}}</td><td>{{row.account_id}}<small>{{row.openid_masked||'—'}}</small></td><td><img v-if="image(row)" :src="image(row)" :alt="row.current_sku.item_name||'当前商品'" loading="lazy" @error="imageFailed(row,$event)"/><span v-else class="field-hint">无可用预览</span><small>SKU {{row.sku_id}}</small>{{row.current_sku.item_name||'商品名称不可用'}}<small>{{row.current_sku.diameter_mm===null?'珠径未记录':`${row.current_sku.diameter_mm} mm`}}</small><small>{{row.current_sku.is_deleted?'已删除':'未删除'}} · {{row.current_sku.is_deleted?'不可售':row.current_sku.is_on_sale?'在售':'已下架'}}</small></td><td>{{couponLabels[row.status]}}<small>{{row.points_cost_snapshot}} 积分</small></td><td>{{row.source_type}}<small>{{row.source_ref||'—'}}</small></td><td>{{row.locked_order_no||'—'}}<small>{{formatBeijingTime(row.locked_at)}}</small></td><td>{{row.used_order_no||'—'}}<small>{{formatBeijingTime(row.used_at)}}</small></td><td>{{row.refund_reason||'—'}}<small>{{formatBeijingTime(row.refunded_at)}}</small></td><td>{{formatBeijingTime(row.created_at)}}</td></tr></tbody></table>
   </div>
   <p v-if="loaded&&!loading&&!error&&!rowCount" class="empty-inline">没有符合条件的{{auditTabs[tab]}}记录。</p><button v-if="next" class="secondary load-more" :disabled="loading" @click="load(true)">加载更多</button>
  </section>
 </main></div>
</template>
<style scoped>
.audit-shell{--stone-bg:#f7f6f2;--stone-paper:#fff;--stone-ink:#20372f;--stone-accent:#285c4d;font-family:'Microsoft YaHei','PingFang SC',sans-serif}.audit-table{min-width:1100px}.audit-table caption{text-align:left;padding:0 0 14px}.audit-table td{overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.audit-table th{white-space:nowrap}.coupon-audit-table{min-width:1500px}.audit-table img{display:block;width:56px;height:56px;object-fit:cover;border:1px solid var(--stone-border);border-radius:4px;margin-bottom:8px}
</style>
