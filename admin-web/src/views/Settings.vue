<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref} from 'vue';
import provinces from 'province-city-china/dist/province.json';
import type {SiteConfig,SiteConfigKey} from '../../../packages/contracts/src';
import {ApiError} from '../../../packages/contracts/src/client';
import {api,auth} from '../platform';
import {assertSignOutSucceeded} from '../auth-result';
import {operationError} from '../order-model';
import {configLabels,configValue,emptyDraft,pageLinks,readDraft} from '../settings-model';
import ImagePicker from '../components/catalog/ImagePicker.vue';
import MerchantSidebar from '../components/MerchantSidebar.vue';
import {formatBeijingTime} from '../time';
const key=ref<SiteConfigKey>('home_banners'),draft=ref(emptyDraft()),loading=ref(false),saving=ref(false),readable=ref(false),missing=ref(false),error=ref(''),notice=ref(''),result=ref<SiteConfig|null>(null);
const uploads=ref(new Set<string>()),province=ref('440000');
const blocked=computed(()=>saving.value||uploads.value.size>0);
const availableProvinces=computed(()=>provinces.filter(p=>!draft.value.regions.some(r=>r.province_code===p.code)));
const featureRows=computed(()=>[...draft.value.features,...['DIY','STANDARD'].filter(k=>!draft.value.features.some(r=>r.key===k)).map(k=>({key:k,enabled:false}))]);
let version=0,localId=0;
function uploading(id:string,value:boolean){if(value)uploads.value.add(id);else uploads.value.delete(id);}
async function load(next:SiteConfigKey=key.value) {
 if(blocked.value)return;
 const current=++version;key.value=next;loading.value=true;readable.value=false;missing.value=false;error.value='';notice.value='';result.value=null;draft.value=emptyDraft();
 try {const {data}=await api<SiteConfig>('getSiteConfig',{config_key:next});if(current!==version)return;if(data.config_key!==next)throw new Error('配置返回键与请求不符');const parsed=readDraft(next,data.config_value);draft.value=parsed;result.value=data;readable.value=true;}
 catch(e){if(current!==version)return;if(e instanceof ApiError&&e.code==='NOT_FOUND'){missing.value=true;readable.value=true;}else error.value=operationError(e);}
 finally{if(current===version)loading.value=false;}
}
async function save() {
 if(blocked.value||loading.value||!readable.value)return;
 error.value='';notice.value='';let value;try{value=configValue(key.value,draft.value);}catch(e){error.value=operationError(e);return;}
 saving.value=true;const target=key.value;
 try {const {data}=await api<SiteConfig>('updateSiteConfig',{config_key:target,config_value:value});if(data.config_key!==target)throw new Error('配置返回键与请求不符');const parsed=readDraft(target,data.config_value);draft.value=parsed;result.value=data;missing.value=false;notice.value='配置已保存，以下为服务器返回结果。';}
 catch(e){error.value=operationError(e);}finally{saving.value=false;}
}
function addBanner(){if(blocked.value)return;draft.value.banners.push({id:`new-${++localId}`,image_file_id:'',link_type:'NONE',link_value:'',sort:String((draft.value.banners.length+1)*10)});}
function moveBanner(index:number,delta:number){if(blocked.value)return;const other=index+delta;if(other<0||other>=draft.value.banners.length)return;const [row]=draft.value.banners.splice(index,1);if(row)draft.value.banners.splice(other,0,row);draft.value.banners.forEach((r,i)=>{r.sort=String((i+1)*10);});}
function setFeature(name:string,event:Event){const enabled=(event.target as HTMLInputElement).checked;const row=draft.value.features.find(r=>r.key===name);if(row)row.enabled=enabled;else draft.value.features.push({key:name,enabled});}
function addRegion(){const row=availableProvinces.value.find(p=>p.code===province.value);if(!row||blocked.value)return;draft.value.regions.push({province_code:row.code,province_name:row.name,fee:'0.00',sort:'10',enabled:true});province.value=availableProvinces.value[0]?.code??'';}
async function logout(){try{assertSignOutSucceeded(await auth.signOut());}catch(e){error.value=operationError(e);}}
onMounted(()=>load());onBeforeUnmount(()=>{version++;});
</script>
<template>
 <div class="catalog-shell operations-shell"><MerchantSidebar active="settings" :busy="blocked" @logout="logout"/><main class="catalog-workspace">
  <header class="catalog-page-header"><div><p class="eyebrow">SETTINGS / 站点配置</p><h1>站点配置</h1><p class="muted">管理小程序内容、配送与活动规则。</p></div><button class="secondary" :disabled="blocked||loading" @click="load()">重新读取</button></header>
  <div class="type-switch config-tabs" aria-label="配置分组"><button v-for="(label,value) in configLabels" :key="value" :aria-pressed="key===value" :class="{selected:key===value}" :disabled="blocked" @click="load(value)">{{label}}</button></div>
  <p v-if="error" role="alert" class="error">{{error}}</p><p v-if="notice" role="status" class="success-notice">{{notice}}</p><p v-if="loading" role="status">正在读取{{configLabels[key]}}…</p><p v-if="missing" class="config-empty" role="status">当前未配置。可按下方已知结构编辑并创建。</p>
  <form class="product-panel settings-editor" @submit.prevent="save"><h2>{{configLabels[key]}}</h2><fieldset :disabled="loading||!readable||saving">
   <template v-if="key==='home_banners'"><p class="field-hint">上传图片后保存云文件引用。按排序值展示；上下移动会重新编号。</p><article v-for="(row,index) in draft.banners" :key="row.id" class="config-row"><div class="row-between"><h3>轮播图 {{index+1}}</h3><div class="row-actions"><button type="button" class="secondary" :disabled="blocked||index===0" @click="moveBanner(index,-1)">上移</button><button type="button" class="secondary" :disabled="blocked||index===draft.banners.length-1" @click="moveBanner(index,1)">下移</button><button type="button" class="text-button danger-text" data-test="delete-banner" :disabled="blocked" @click="draft.banners.splice(index,1)">删除</button></div></div><ImagePicker :model-value="row.image_file_id?[row.image_file_id]:[]" :label="`轮播图 ${index+1}`" :max="1" :disabled="saving" @update:model-value="row.image_file_id=$event[0]??''" @busy="uploading(row.id,$event)"/><div class="field-grid"><label>链接类型<select v-model="row.link_type" :disabled="uploads.has(row.id)" @change="row.link_value=row.link_type==='NONE'?'':pageLinks[0]!.value"><option value="NONE">不跳转</option><option value="PAGE">小程序页面</option></select></label><label v-if="row.link_type==='PAGE'">目标页面<select v-model="row.link_value" :disabled="uploads.has(row.id)"><option v-if="!pageLinks.some(p=>p.value===row.link_value)" :value="row.link_value">已存页面：{{row.link_value}}</option><option v-for="page in pageLinks" :key="page.value" :value="page.value">{{page.label}} · {{page.value}}</option></select></label><label>排序值<input v-model="row.sort" type="text" inputmode="numeric" :disabled="uploads.has(row.id)"/></label></div></article><p v-if="!draft.banners.length" class="empty-inline">尚无轮播图。</p><button type="button" class="secondary" :disabled="blocked" @click="addBanner">添加轮播图</button></template>
   <template v-else-if="key==='customer_service'"><label class="check-field"><input v-model="draft.serviceEnabled" type="checkbox" :disabled="blocked"/>启用客服（关闭后隐藏客服）</label><div v-if="draft.serviceEnabled"><label for="service-wechat">客服微信号</label><input id="service-wechat" v-model="draft.wechat" maxlength="128"/><ImagePicker :model-value="draft.qr?[draft.qr]:[]" label="客服二维码" :max="1" :disabled="saving" @update:model-value="draft.qr=$event[0]??''" @busy="uploading('service-qr',$event)"/></div></template>
   <template v-else-if="key==='feature_entries'"><p class="field-hint">本期支持 DIY 与标准商品入口。其他已存入口会保留并明确列出。</p><label v-for="entry in featureRows" :key="entry.key" class="check-field"><input type="checkbox" :checked="entry.enabled" @change="setFeature(entry.key,$event)"/>{{entry.key==='DIY'?'DIY 手串设计':entry.key==='STANDARD'?'标准商品':`已存其他入口：${entry.key}`}} <small>{{entry.key}}</small></label></template>
   <template v-else-if="key==='shipping_rules'"><p class="field-hint">完整保留已存省份与禁用规则。金额单位为元，最多两位小数；仅启用地区可配送。</p><div class="table-scroll"><table class="shipping-table"><thead><tr><th>省份 / 代码</th><th>运费（元）</th><th>排序</th><th>启用配送</th><th>操作</th></tr></thead><tbody><tr v-for="(row,index) in draft.regions" :key="row.province_code"><td>{{row.province_name}}<small>{{row.province_code}}</small></td><td><input v-model="row.fee" :aria-label="`${row.province_name}运费`" inputmode="decimal"/></td><td><input v-model="row.sort" :aria-label="`${row.province_name}排序`" inputmode="numeric"/></td><td><input v-model="row.enabled" type="checkbox" :aria-label="`启用${row.province_name}配送`"/></td><td><button type="button" class="text-button danger-text" @click="draft.regions.splice(index,1)">删除</button></td></tr></tbody></table></div><div class="region-add"><label>新增省份<select v-model="province"><option value="" disabled>选择省份</option><option v-for="p in availableProvinces" :key="p.code" :value="p.code">{{p.name}} · {{p.code}}</option></select></label><button type="button" class="secondary" :disabled="!availableProvinces.some(p=>p.code===province)" @click="addRegion">添加配送规则</button></div></template>
   <template v-else-if="key==='payment_rules'"><label for="payment-timeout">支付超时时间（分钟）</label><input id="payment-timeout" value="5" readonly/><p class="field-hint">本期固定为 5 分钟，由服务器执行支付时限。</p></template>
   <template v-else-if="key==='points_rules'"><div class="field-grid"><label for="daily-points">每日签到积分<input id="daily-points" v-model="draft.daily" inputmode="numeric"/></label><label for="referral-points">邀请首单完成奖励积分<input id="referral-points" v-model="draft.referral" inputmode="numeric"/></label></div><p class="field-hint">范围 0–4294967295 的整数；0 表示关闭对应活动。仅配置奖励规则，实际积分发放由后端处理。</p></template>
  </fieldset><footer class="form-footer"><button type="submit" :disabled="blocked||loading||!readable">{{saving?'保存中…':uploads.size?'图片上传中…':'保存配置'}}</button><span class="field-hint">{{result?.updated_at?`服务器更新时间（北京时间）：${formatBeijingTime(result.updated_at)}`:'尚无服务器更新时间'}}</span></footer></form>
  <section v-if="result" class="product-panel config-result"><h2>服务器配置结果</h2><p class="request-id">{{result.config_key}} · 更新时间（北京时间）{{formatBeijingTime(result.updated_at)}}</p><details><summary>查看服务器返回的完整配置</summary><pre>{{JSON.stringify(result,null,2)}}</pre></details></section>
 </main></div>
</template>
