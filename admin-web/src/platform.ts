import cloudbase from '@cloudbase/js-sdk';
import { createRequestClient } from '../../packages/contracts/src/client';

export const ENV_ID=import.meta.env.VITE_CLOUDBASE_ENV_ID;
const publishableKey=import.meta.env.VITE_PUBLISHABLE_KEY;
if(!ENV_ID || !publishableKey) throw new Error('缺少开发环境配置，请按 .env.example 配置 VITE_CLOUDBASE_ENV_ID 和 VITE_PUBLISHABLE_KEY');
export const app=cloudbase.init({env:ENV_ID,region:'ap-shanghai',accessKey:publishableKey,auth:{detectSessionInUrl:true}});
export const auth=app.auth;
export const api=createRequestClient(async(action,payload)=> app.callFunction({name:'business-api',data:{action,payload}}));

export async function hasSession():Promise<boolean> {
  const {data,error}=await auth.getSession();
  if(error) throw error;
  return Boolean(data.session && !data.session.user?.is_anonymous);
}

export async function requireAdmin():Promise<void> {
  // Session proves identity only; the server must additionally check admin_allowlist.
  if(!await hasSession()) throw new Error('请先登录');
  await api('getSiteConfig',{config_key:'feature_entries'});
}
