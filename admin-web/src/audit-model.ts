import type {AdminPointsLedgerPayload,AdminReferralRelationsPayload,AdminSkuCouponsPayload,CouponStatus,PointsSourceType} from '../../packages/contracts/src';
import {timeRange} from './time';
export type AuditTab='ledger'|'referrals'|'coupons';
export const auditTabs:Record<AuditTab,string>={ledger:'积分流水',referrals:'邀请关系',coupons:'兑换券'};
export const sourceLabels:Record<PointsSourceType,string>={DAILY_CHECK_IN:'每日签到',REFERRAL_FIRST_COMPLETED_ORDER:'邀请首单完成',POINTS_EXCHANGE:'积分兑换',POINTS_EXCHANGE_REFUND:'积分兑换退回'};
export const couponLabels:Record<CouponStatus,string>={AVAILABLE:'可用',LOCKED:'已锁定',USED:'已使用',REFUNDED:'已退回'};
export interface AuditFilter{openid:string;source:string;inviter:string;invitee:string;rewarded:string;skuId:string;status:string;from:string;to:string}
export function emptyAuditFilter():AuditFilter{return {openid:'',source:'',inviter:'',invitee:'',rewarded:'',skuId:'',status:'',from:'',to:''};}
function choice<T extends string>(value:string,labels:Record<T,string>):T|null{if(!value)return null;if(!Object.hasOwn(labels,value))throw new Error('请选择有效筛选项');return value as T;}
export function auditQuery(tab:AuditTab,filter:AuditFilter,token:string|null):AdminPointsLedgerPayload|AdminReferralRelationsPayload|AdminSkuCouponsPayload{
 const common={...timeRange(filter.from,filter.to),page_token:token,page_size:20};
 if(tab==='ledger')return {...common,openid:filter.openid.trim()||null,source_type:choice(filter.source,sourceLabels)};
 if(tab==='referrals'){
  if(!['','true','false'].includes(filter.rewarded))throw new Error('请选择有效奖励状态');
  return {...common,inviter_openid:filter.inviter.trim()||null,invitee_openid:filter.invitee.trim()||null,rewarded:filter.rewarded?filter.rewarded==='true':null};
 }
 const sku=filter.skuId.trim();
 if(sku&&(!/^\d+$/.test(sku)||BigInt(sku)<1n||BigInt(sku)>18446744073709551615n))throw new Error('SKU ID 须为有效的正整数');
 return {...common,sku_id:sku||null,openid:filter.openid.trim()||null,status:choice(filter.status,couponLabels)};
}
export function signedPoints(value:string):string{return /^\d+$/.test(value)&&BigInt(value)>0n?`+${value}`:value;}
