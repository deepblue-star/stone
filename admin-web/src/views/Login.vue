<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { auth, requireAdmin } from '../platform';
import { ApiError } from '../../../packages/contracts/src/client';
const username=ref('');const password=ref('');const submitting=ref(false);const error=ref('');
const router=useRouter();
async function login(){
  if(submitting.value)return;
  submitting.value=true;error.value='';
  try {
    const result=await auth.signInWithPassword({username:username.value,password:password.value});
    if(result.error)throw result.error;
    password.value='';await requireAdmin();await router.replace('/');
  } catch(e){
    error.value=e instanceof ApiError?`${e.message}${e.requestId?`（请求 ${e.requestId}）`:''}`:'登录未完成，请检查账号或联系管理员';
  } finally{submitting.value=false;}
}
</script>
<template>
  <main class="login-layout">
    <section class="brand-panel"><p class="eyebrow">STONE / MERCHANT</p><h1>晶石手串<br>商家工作台</h1><p>商品、设计与每一笔订单，<br>从这里开始管理。</p><small>开发环境 · 基础框架验证</small></section>
    <section class="login-panel"><p class="eyebrow">ACCOUNT ACCESS</p><h2>登录管理端</h2><p class="muted">请使用已获授权的商家账号</p>
      <form @submit.prevent="login"><label for="username">账号</label><input id="username" v-model="username" autocomplete="username" required :disabled="submitting"/>
      <label for="password">密码</label><input id="password" v-model="password" type="password" autocomplete="current-password" required :disabled="submitting"/>
      <p v-if="error" role="alert" class="error">{{error}}</p><button type="submit" :disabled="submitting">{{submitting?'正在登录…':'登录'}}</button></form>
      <p class="muted note">账号由管理员分配。如需开通或重置密码，请联系管理员。</p>
    </section>
  </main>
</template>
