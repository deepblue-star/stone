<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { auth, api } from '../platform';
import type { PublicSiteConfig } from '../../../packages/contracts/src';
import { ApiError } from '../../../packages/contracts/src/client';
import { assertSignOutSucceeded } from '../auth-result';
const config=ref<PublicSiteConfig|null>(null);const error=ref('');const loading=ref(false);const requestId=ref('');
async function refresh(){if(loading.value)return;loading.value=true;error.value='';
  try{const result=await api<PublicSiteConfig>('getPublicSiteConfig',{});config.value=result.data;requestId.value=result.requestId;}
  catch(e){error.value=e instanceof ApiError?e.message:'配置读取失败';if(e instanceof ApiError)requestId.value=e.requestId??'';}
  finally{loading.value=false;}
}
async function logout(){try{assertSignOutSucceeded(await auth.signOut());}catch{error.value='退出未完成，请重试';}}
onMounted(refresh);
</script>
<template><div class="workbench"><aside><p class="eyebrow">STONE</p><h2>商家工作台</h2><nav><span aria-current="page">联通检查</span></nav><button class="secondary" @click="logout">退出登录</button></aside>
  <main class="content"><header><div><p class="eyebrow">DEVELOPMENT</p><h1>基础服务联通</h1></div><button @click="refresh" :disabled="loading">{{loading?'正在读取…':'刷新配置'}}</button></header>
    <p class="muted">此页面验证真实接口调用，业务管理页面将在对应模块中实现。</p><p v-if="error" role="alert" class="error">{{error}}</p>
    <section class="result-panel" v-if="config"><h2>公开配置已读取</h2><dl><dt>Banner</dt><dd>{{config.banners.length}} 条</dd><dt>客服</dt><dd>{{config.customer_service?'已配置':'未配置'}}</dd><dt>功能入口</dt><dd>{{config.feature_entries.length}} 项</dd></dl></section>
    <p v-if="requestId" class="request-id">请求标识 {{requestId}}</p>
  </main></div></template>
