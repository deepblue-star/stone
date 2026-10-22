import type { AmountCent, ListAdminOrdersPayload, OrderStatus } from '../../packages/contracts/src';
import { ApiError } from '../../packages/contracts/src/client';
import {timeRange} from './time';
export const statusLabels:Record<OrderStatus,string>={PENDING_PAYMENT:'待付款',READY_TO_SHIP:'待发货',SHIPPED:'已发货',COMPLETED:'已完成',CLOSED:'已关闭'};
export function moneyText(value:AmountCent):string { const cent=BigInt(value);return `${cent/100n}.${String(cent%100n).padStart(2,'0')}`; }
export function orderQuery(filter:{status:OrderStatus|'';orderNo:string;from:string;to:string},token:string|null):ListAdminOrdersPayload {
 return {status:filter.status||null,order_no:filter.orderNo.trim()||null,...timeRange(filter.from,filter.to),page_token:token,page_size:20};
}
export const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function snapshotText(value:unknown):string {return typeof value==='string'||typeof value==='number'?String(value):'—';}
export function componentsOf(snapshot:Record<string,unknown>):Record<string,unknown>[] {return Array.isArray(snapshot.components)?snapshot.components.filter(record):[];}
export function operationError(error:unknown):string {return `${error instanceof Error?error.message:'操作未完成，请重试'}${error instanceof ApiError&&error.requestId?`（请求标识 ${error.requestId}）`:''}`;}
