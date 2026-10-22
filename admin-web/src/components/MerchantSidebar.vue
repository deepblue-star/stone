<script setup lang="ts">
import {RouterLink} from 'vue-router';
import {Gem,Layers,Package,Settings,RefreshCw,Users} from '@lucide/vue';
defineProps<{active:'orders'|'settings'|'audit';busy?:boolean}>();
defineEmits<{logout:[]}>();
const links=[{to:'/catalog',key:'catalog',label:'商品与库存',icon:Layers},{to:'/orders',key:'orders',label:'订单履约',icon:Package},{to:'/audit',key:'audit',label:'会员权益',icon:Users},{to:'/settings',key:'settings',label:'站点配置',icon:Settings},{to:'/',key:'overview',label:'联通检查',icon:RefreshCw}];
</script>
<template>
 <aside class="merchant-sidebar">
  <!-- A disabled navigation item has no RouterLink or href to activate. -->
  <component :is="busy?'a':RouterLink" :to="busy?undefined:'/catalog'" class="brand-lockup" :aria-disabled="busy||undefined" :tabindex="busy?-1:undefined">
   <Gem :size="28" aria-hidden="true"/><span>STONE<small>商家工作台</small></span>
  </component>
  <nav aria-label="管理导航">
   <component :is="busy?'a':RouterLink" v-for="link in links" :key="link.key" :to="busy?undefined:link.to" :aria-current="active===link.key?'page':undefined" :aria-disabled="busy||undefined" :tabindex="busy?-1:undefined">
    <component :is="link.icon" :size="19" aria-hidden="true"/>{{link.label}}
   </component>
  </nav>
  <p class="sidebar-note">商家管理<br/>业务数据以服务器为准</p>
  <button class="secondary" :disabled="busy" @click="$emit('logout')">退出登录</button>
 </aside>
</template>
