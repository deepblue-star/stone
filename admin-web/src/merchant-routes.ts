import type {RouteRecordRaw} from 'vue-router';
export const merchantRoutes:RouteRecordRaw[]=[
 {path:'/catalog',component:()=>import('./views/Catalog.vue'),meta:{requiresAdmin:true}},
 {path:'/orders',component:()=>import('./views/Orders.vue'),meta:{requiresAdmin:true}},
 {path:'/settings',component:()=>import('./views/Settings.vue'),meta:{requiresAdmin:true}},
 {path:'/audit',component:()=>import('./views/Audit.vue'),meta:{requiresAdmin:true}},
];
